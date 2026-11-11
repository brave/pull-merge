import { After, Given, Then, When } from '@cucumber/cucumber'
import { expect } from 'chai'
import http from 'node:http'
import { fetchWithRetry, requestOnce, retryDelayMs } from '../../src/fetchRetry.js'
import { hermeticFetch, makeResponse, STATUS_TEXT } from '../support/fake-fetch.mjs'
import { mockState } from '../support/state.mjs'

// Captured at module load, before world.mjs swaps globalThis.fetch: lets the
// requestOnce scenarios exercise a real loopback HTTP server.
const realFetch = globalThis.fetch

function scriptedFetchOnce (script) {
  let calls = 0
  const fetchOnce = async () => {
    const step = script[Math.min(calls, script.length - 1)]
    calls++
    if (typeof step === 'number') return makeResponse(step)
    if (step.throwStatus) {
      const err = new Error(`HTTP ${step.throwStatus} ${step.statusText}`)
      err.statusCode = step.throwStatus
      err.statusText = step.statusText
      throw err
    }
    if (step.networkError) throw new Error(step.networkError)
    return makeResponse(step.status ?? 200, step.body ?? '', step.statusText)
  }
  fetchOnce.__count = () => calls
  return fetchOnce
}

function startServer (handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/asset` })
    })
  })
}

Given('a per-attempt fetch returning HTTP {int} twice then {int} with body {string}', function (status, okStatus, body) {
  this.fetchOnce = scriptedFetchOnce([status, status, { status: okStatus, body }])
  this.sleep = () => Promise.resolve()
})

Given('a per-attempt fetch returning HTTP {int} on every attempt', function (status) {
  this.fetchOnce = scriptedFetchOnce([status])
})

Given('a per-attempt fetch that throws an HTTP {int} error', function (status) {
  this.fetchOnce = scriptedFetchOnce([{ throwStatus: status, statusText: STATUS_TEXT[status] ?? 'Error' }])
  this.sleep = () => Promise.resolve()
})

Given('a per-attempt fetch that fails with the network error {string}', function (message) {
  this.fetchOnce = scriptedFetchOnce([{ networkError: message }])
  this.sleep = () => Promise.resolve()
})

Given('fetchWithRetry is limited to {int} attempts', function (attempts) {
  this.attempts = attempts
})

Given('the fetch backoff is disabled', function () {
  this.sleep = () => Promise.resolve()
})

Given('the fetch backoff is recorded', function () {
  this.delays = []
  this.sleep = (ms) => {
    this.delays.push(ms)
    return Promise.resolve()
  }
})

When('fetchWithRetry fetches {string}', async function (url) {
  this.error = null
  try {
    this.response = await fetchWithRetry(url, {
      fetchOnce: this.fetchOnce,
      sleep: this.sleep,
      ...(this.attempts ? { attempts: this.attempts } : {})
    })
  } catch (err) {
    this.error = err
  }
})

Then('it resolves with HTTP {int} and body {string}', async function (status, body) {
  expect(this.error ?? null).to.equal(null)
  expect(this.response.status).to.equal(status)
  expect(await this.response.text()).to.equal(body)
})

Then('it returns the HTTP {int} response', function (status) {
  expect(this.error ?? null).to.equal(null)
  expect(this.response.status).to.equal(status)
})

Then('the per-attempt fetch was called {int} time(s)', function (count) {
  expect(this.fetchOnce.__count()).to.equal(count)
})

Then('the delays between attempts were {int}, {int}, {int}, {int} milliseconds', function (a, b, c, d) {
  expect(this.delays).to.deep.equal([a, b, c, d])
})

Then('retryDelayMs is 2000 at attempt 0 and capped at 60000 from attempt 6', function () {
  expect(retryDelayMs(0)).to.equal(2000)
  expect(retryDelayMs(1)).to.equal(4000)
  expect(retryDelayMs(6)).to.equal(60000)
  expect(retryDelayMs(10)).to.equal(60000)
})

Given('a local server that redirects once to the body {string}', async function (body) {
  let redirected = false
  const { server, url } = await startServer((req, res) => {
    if (!redirected) {
      redirected = true
      res.writeHead(302, { location: '/cdn' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(body)
  })
  this.localServer = server
  this.localUrl = url
})

Given('a local server that stalls the first request then serves {string}', async function (body) {
  let requests = 0
  const { server, url } = await startServer((req, res) => {
    requests++
    if (requests === 1) {
      // Never answer: the attempt must hit its timeout and be retried.
      req.on('close', () => res.destroy())
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(body)
  })
  this.localServer = server
  this.localUrl = url
  this.localRequests = () => requests
})

When('requestOnce fetches the local URL', async function () {
  globalThis.fetch = realFetch
  this.error = null
  try {
    this.response = await requestOnce(this.localUrl)
  } catch (err) {
    this.error = err
  } finally {
    globalThis.fetch = hermeticFetch
  }
})

When('fetchWithRetry fetches the local URL with a {int}ms attempt timeout', async function (timeoutMs) {
  globalThis.fetch = realFetch
  this.error = null
  try {
    this.response = await fetchWithRetry(this.localUrl, { timeoutMs, sleep: this.sleep })
  } catch (err) {
    this.error = err
  } finally {
    globalThis.fetch = hermeticFetch
  }
})

Then('it resolves with body {string}', async function (body) {
  expect(this.error ?? null).to.equal(null)
  expect(await this.response.text()).to.equal(body)
})

Then('the local server saw {int} requests', function (count) {
  expect(this.localRequests()).to.equal(count)
})

Then('the diff was fetched {int} times from {string}', function (count, url) {
  expect(mockState().fetchCalls.filter((call) => call.url === url)).to.have.lengthOf(count)
})

Given('the public diff at {string} responds with HTTP {int} twice then succeeds with:', function (url, status, doc) {
  mockState().fetchRoutes.push({
    match: (u) => u === url,
    script: [status, status, { status: 200, body: doc.replace(/\n$/, '') }]
  })
})

Given('the compare diff at {string} responds with HTTP {int} twice then succeeds with:', function (url, status, doc) {
  mockState().fetchRoutes.push({
    match: (u) => u === url,
    script: [status, status, { status: 200, body: doc.replace(/\n$/, '') }]
  })
})

After(function () {
  if (this.localServer) this.localServer.close()
})
