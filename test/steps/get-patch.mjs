import { Before, Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeGithub } from '../support/fake-github.mjs'
import { mockState } from '../support/state.mjs'

const trimDoc = (doc) => doc.replace(/\n$/, '')

const PULLS_ROUTE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}'
const REPO_ROUTE = 'GET /repos/{owner}/{repo}'

Before(function () {
  delete process.env.GITHUB_TOKEN
})

Given('the public diff at {string} responds with:', function (url, doc) {
  mockState().fetchRoutes.push({
    match: (u) => u === url,
    body: trimDoc(doc)
  })
})

Given('the public diff at {string} responds with status {int} {string}', function (url, status, statusText) {
  mockState().fetchRoutes.push({ match: (u) => u === url, status, statusText })
})

Given('the pull diff endpoint replies with:', function (doc) {
  mockState().github.requestRoutes.push({
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'diff',
    reply: { data: trimDoc(doc) }
  })
})

Given('the pull diff endpoint fails with {string}', function (message) {
  mockState().github.requestRoutes.push({
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'diff',
    error: new Error(message)
  })
})

Given('the pull json endpoint replies with shas {string} and {string}', function (baseSha, headSha) {
  mockState().github.requestRoutes.push({
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'json',
    reply: { data: { base: { sha: baseSha }, head: { sha: headSha } } }
  })
})

Given('the repo is public', function () {
  mockState().github.requestRoutes.push({
    match: (route) => route === REPO_ROUTE,
    reply: { data: { private: false, visibility: 'public' } }
  })
})

Given('the repo is private', function () {
  mockState().github.requestRoutes.push({
    match: (route) => route === REPO_ROUTE,
    reply: { data: { private: true, visibility: 'private' } }
  })
})

Given('the repo is private by visibility', function () {
  mockState().github.requestRoutes.push({
    match: (route) => route === REPO_ROUTE,
    reply: { data: { private: false, visibility: 'private' } }
  })
})

Given('runIfPrivate is enabled', function () {
  this.runIfPrivate = true
})

Given('the environment variable GITHUB_TOKEN is {string}', function (token) {
  process.env.GITHUB_TOKEN = token
})

Given('the git toolchain produces diff:', function (doc) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm-record-'))
  this.recordPath = path.join(dir, 'record.jsonl')
  process.env.PM_DIFF_CONTENT = trimDoc(doc)
  process.env.PM_RECORD = this.recordPath
})

When('getPatch is called', async function () {
  const { default: getPatch } = await import('../../src/getPatch.js')
  this.error = null
  try {
    this.result = await getPatch({
      owner: this.owner,
      repo: this.repo,
      prnum: this.prnum,
      githubToken: this.githubToken ?? null,
      github: this.github ?? null,
      runIfPrivate: this.runIfPrivate ?? false,
      debug: this.debug ?? false
    })
  } catch (err) {
    this.error = err
  }
})

Then('the log line {string} was recorded', function (line) {
  expect(mockState().logs).to.include(line)
})

Then('gh cloned {string} and git diffed {string} and {string}', function (ownerRepo, baseSha, headSha) {
  const entries = readFileSync(this.recordPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const gh = entries.find((entry) => entry.bin === 'gh')
  const git = entries.find((entry) => entry.bin === 'git')
  expect(gh.argv).to.deep.equal(['repo', 'clone', ownerRepo, path.join(os.tmpdir(), `pr-${this.prnum}`)])
  expect(git.argv).to.deep.equal(['diff', baseSha, headSha])
})

Then('the clone directory was removed', function () {
  expect(existsSync(path.join(os.tmpdir(), `pr-${this.prnum}`))).to.equal(false)
})

Then('{int} github requests were made', function (count) {
  expect(mockState().github.requestCalls).to.have.lengthOf(count)
})

When('the public fetch round-trip property holds for {int} runs', async function (runs) {
  const { default: getPatch } = await import('../../src/getPatch.js')
  const name = fc.stringMatching(/^[a-z]{1,6}$/)
  const diffBody = fc.array(fc.constantFrom('a', 'b', ' ', '\n', '+', '-'), { maxLength: 30 }).map((chars) => chars.join(''))
  const current = { url: '', body: '' }
  const route = { match: (u) => u === current.url, body: '' }
  mockState().fetchRoutes.push(route)
  await fc.assert(fc.asyncProperty(name, name, fc.nat(9999), diffBody, async (owner, repo, prnum, body) => {
    current.url = `https://github.com/${owner}/${repo}/pull/${prnum}.diff`
    route.body = body
    mockState().fetchCalls.length = 0
    const out = await getPatch({ owner, repo, prnum })
    expect(out).to.deep.equal({
      repo,
      owner,
      type: 'simple',
      body,
      watermark: `[[puLL-Merge](https://github.com/brave/pull-merge)] - [${owner}/${repo}@${prnum}](https://github.com/${owner}/${repo}/pull/${prnum})`
    })
    expect(mockState().fetchCalls[0].url).to.equal(current.url)
  }), { numRuns: runs })
})

When('the github round-trip property holds for {int} runs', async function (runs) {
  const { default: getPatch } = await import('../../src/getPatch.js')
  const name = fc.stringMatching(/^[a-z]{1,6}$/)
  const diffBody = fc.array(fc.constantFrom('a', 'b', ' ', '\n', '+', '-'), { maxLength: 30 }).map((chars) => chars.join(''))
  let currentBody = ''
  mockState().github.requestRoutes.push({
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'diff',
    reply: () => ({ data: currentBody })
  })
  mockState().github.requestRoutes.push({
    match: (route) => route === REPO_ROUTE,
    reply: { data: { private: false, visibility: 'public' } }
  })
  await fc.assert(fc.asyncProperty(name, name, fc.nat(9999), diffBody, async (owner, repo, prnum, body) => {
    currentBody = body
    const out = await getPatch({ owner, repo, prnum, github: makeGithub() })
    expect(out.repo).to.equal(repo)
    expect(out.owner).to.equal(owner)
    expect(out.type).to.equal('simple')
    expect(out.body).to.equal(body)
    expect(out.watermark).to.equal(`[[puLL-Merge](https://github.com/brave/pull-merge)] - [${owner}/${repo}@${prnum}](https://github.com/${owner}/${repo}/pull/${prnum})`)
  }), { numRuns: runs })
})
