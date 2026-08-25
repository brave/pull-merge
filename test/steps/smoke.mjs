import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import { spawn } from 'child_process'
import { mockState } from '../support/state.mjs'

When('a probe module constructs an OpenAI client with apiKey {string}', async function (apiKey) {
  const probe = await import('../support/probe-openai.mjs')
  probe.default({ apiKey })
})

Then('the OpenAI mock records the constructor argument apiKey {string}', function (apiKey) {
  const args = mockState().openai.constructorArgs
  expect(args).to.have.lengthOf(1)
  expect(args[0]).to.deep.equal({ apiKey })
})

When('fetch is called for {string}', async function (url) {
  this.fetchError = null
  this.fetchResult = null
  try {
    this.fetchResult = await fetch(url)
  } catch (err) {
    this.fetchError = err
  }
})

Then('fetch throws a hermetic network error', function () {
  expect(this.fetchError).to.be.an('error')
  expect(this.fetchError.message).to.contain('hermetic fetch')
})

Given('a fetch route matching {string} with status {int} and body {string}', function (pattern, status, body) {
  mockState().fetchRoutes.push({ match: new RegExp(pattern), status, body })
})

Then('the response status is {int} and text is {string}', async function (status, body) {
  expect(this.fetchError).to.equal(null)
  expect(this.fetchResult.status).to.equal(status)
  expect(await this.fetchResult.text()).to.equal(body)
})

When('the filterdiff shim is spawned with content {string}', async function (content) {
  const cp = spawn('filterdiff', [])
  let output = ''
  cp.stdout.on('data', (chunk) => { output += chunk })
  const closed = new Promise((resolve) => cp.on('close', resolve))
  cp.stdin.write(content)
  cp.stdin.end()
  await closed
  this.shimOutput = output
})

Then('the shim echoes the content back', function () {
  expect(this.shimOutput).to.equal('hello patch')
})
