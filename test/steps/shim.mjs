import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import assert from 'node:assert'

const EVENT_FILE = '/tmp/pull-merge-event-payload.json'
const OUTPUT_FILE = '/tmp/pull-merge-github-output'
const ENV_FILE = '/tmp/pull-merge-github-env'
const SUMMARY_FILE = '/tmp/pull-merge-github-summary'

function fakeFsx () {
  const files = {}
  return {
    __files: files,
    readFileSync: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`)
      return files[p]
    },
    appendFileSync: (p, content) => { files[p] = (files[p] || '') + content },
    existsSync: (p) => p in files
  }
}

class FakeOctokit {
  constructor (opts) {
    FakeOctokit.lastOpts = opts
  }
}

Given('a runner environment with repository {string} and event {string}', function (repo, eventName) {
  this.shimEnv = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: repo,
    GITHUB_EVENT_NAME: eventName,
    GITHUB_ACTOR: 'tester',
    GITHUB_SHA: 'deadbeef',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_PATH: EVENT_FILE,
    GITHUB_OUTPUT: OUTPUT_FILE
  }
  this.shimFsx = fakeFsx()
  this.shimLog = []
})

Given('an event payload file describing pull request {int}', function (number) {
  this.shimFsx.__files[EVENT_FILE] = JSON.stringify({
    issue: { number },
    pull_request: { number, html_url: `https://github.com/x/y/pull/${number}` }
  })
})

Given('no GITHUB_OUTPUT file is configured', function () {
  delete this.shimEnv.GITHUB_OUTPUT
})

Given('a GITHUB_TOKEN of {string}', function (token) {
  this.shimEnv.GITHUB_TOKEN = token
})

Given('GITHUB_ENV and GITHUB_STEP_SUMMARY files are configured', function () {
  this.shimEnv.GITHUB_ENV = ENV_FILE
  this.shimEnv.GITHUB_STEP_SUMMARY = SUMMARY_FILE
})

Given('an INPUT_GITHUB_TOKEN environment entry of {string}', function (token) {
  this.shimEnv.INPUT_GITHUB_TOKEN = token
})

When('the shim builds the github-script surface', async function () {
  const { buildGithubScriptShim } = await import('../../src/shim.js')
  this.shimResult = await buildGithubScriptShim({
    env: this.shimEnv,
    fsx: this.shimFsx,
    log: (...args) => this.shimLog.push(args.join(' ')),
    actionPath: process.cwd(),
    OctokitClass: FakeOctokit
  })
})

Then('the context repo is {string}', function (repo) {
  const [owner, name] = repo.split('/')
  expect(this.shimResult.context.repo).to.deep.equal({ owner, repo: name })
})

Then('the context event name is {string}', function (eventName) {
  expect(this.shimResult.context.eventName).to.equal(eventName)
})

Then('the context actor is the runner actor', function () {
  expect(this.shimResult.context.actor).to.equal('tester')
})

Then('the context issue number is {int}', function (number) {
  expect(this.shimResult.context.issue.number).to.equal(number)
})

Then('the context payload mirrors the event file', function () {
  const payload = JSON.parse(this.shimFsx.__files[EVENT_FILE])
  expect(this.shimResult.context.payload).to.deep.equal(payload)
})

Then('core warning emits a warning annotation', function () {
  this.shimResult.core.warning('careful')
  expect(this.shimLog).to.include('::warning::careful')
})

Then('core error emits an error annotation', function () {
  this.shimResult.core.error('broken')
  expect(this.shimLog).to.include('::error::broken')
})

Then('core notice emits a notice annotation', function () {
  this.shimResult.core.notice('fyi')
  expect(this.shimLog).to.include('::notice::fyi')
})

Then('core setFailed emits an error annotation and fails the step', function () {
  this.shimResult.core.setFailed('fatal')
  expect(this.shimLog).to.include('::error::fatal')
  expect(process.exitCode).to.equal(1)
  process.exitCode = 0
})

Then('core setOutput appends to the GITHUB_OUTPUT file for single-line values', function () {
  this.shimResult.core.setOutput('findings', 3)
  expect(this.shimFsx.__files[OUTPUT_FILE]).to.equal('findings=3\n')
})

Then('core setOutput appends a delimited block for a multiline value', function () {
  this.shimResult.core.setOutput('findings', 'line1\nline2')
  expect(this.shimFsx.__files[OUTPUT_FILE]).to.match(
    /findings<<ghadelimiter_[0-9a-f-]+\nline1\nline2\nghadelimiter_[0-9a-f-]+\n/)
})

Then('core exportVariable appends a delimited block for a multiline value', function () {
  this.shimResult.core.exportVariable('REPORT', 'line1\nline2')
  expect(this.shimFsx.__files[ENV_FILE]).to.match(
    /REPORT<<ghadelimiter_[0-9a-f-]+\nline1\nline2\nghadelimiter_[0-9a-f-]+\n/)
})

Then('core getInput returns the environment input', function () {
  expect(this.shimResult.core.getInput('github_token')).to.equal('ghs-input')
})

Then('core getInput throws for a missing required input', function () {
  expect(() => this.shimResult.core.getInput('slack_token', { required: true }))
    .to.throw('Input required and not supplied: slack_token')
})

Then('core summary writes the rendered markdown to GITHUB_STEP_SUMMARY', async function () {
  await this.shimResult.core.summary.addHeading('Review', 2).addRaw('done').write()
  expect(this.shimFsx.__files[SUMMARY_FILE]).to.equal('## Review\ndone')
})

Then('the shim octokit is authenticated with the runner token', function () {
  assert.equal(FakeOctokit.lastOpts.auth, 'ghs-test')
})
