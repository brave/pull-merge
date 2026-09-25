import { Before, After, Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { makeGithub } from '../support/fake-github.mjs'
import { mockState, resetState } from '../support/state.mjs'

const trimDoc = (doc) => doc.replace(/\n$/, '')

const PULLS_ROUTE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}'

function readGitRecord (recordPath) {
  let raw = ''
  try {
    raw = readFileSync(recordPath, 'utf8').trim()
  } catch {
    return []
  }
  if (!raw) return []
  return raw.split('\n').map((line) => JSON.parse(line))
}

Before(function () {
  delete process.env.DEBUG
})

Given('a GITHUB_WORKSPACE directory', function () {
  this.wsDir = mkdtempSync(path.join(tmpdir(), 'pm-ws-'))
  process.env.GITHUB_WORKSPACE = this.wsDir
})

Given('the git toolchain records its invocation', function () {
  this.gitRecordPath = path.join(tmpdir(), `pm-git-record-${process.pid}-${Date.now()}.jsonl`)
  process.env.PM_GIT_RECORD = this.gitRecordPath
})

Given('the git toolchain diff content is {string}', function (content) {
  process.env.PM_DIFF_CONTENT = content
})

Given('the git toolchain fails when the arguments contain {string}', function (fragment) {
  process.env.PM_GIT_FAIL = fragment
})

Given('the git toolchain reports merge base {string}', function (sha) {
  process.env.PM_MERGE_BASE = sha
})

After(function () {
  if (this.wsDir) {
    rmSync(this.wsDir, { recursive: true, force: true })
    delete this.wsDir
  }
  if (this.gitRecordPath) {
    rmSync(this.gitRecordPath, { force: true })
    delete this.gitRecordPath
  }
  delete process.env.PM_DIFF_CONTENT
  delete process.env.PM_GIT_FAIL
  delete process.env.PM_MERGE_BASE
})

Given('the action context has actor {string}', function (actor) {
  this.actor = actor
})

Given('the action context has PR author {string}', function (author) {
  this.prAuthor = author
})

Given('the action context has no pull request payload', function () {
  this.noPayload = true
})

Given('the action context has PR head sha {string}', function (sha) {
  this.prHeadSha = sha
})

Given('the PR head sha from the API is {string}', function (sha) {
  mockState().github.requestRoutes.push({
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format !== 'diff',
    reply: { data: { head: { sha } } }
  })
})

Given('the action inputs:', function (doc) {
  this.actionInputs = JSON.parse(trimDoc(doc))
})

Given('the environment variable DEBUG is {string}', function (value) {
  process.env.DEBUG = value
})

Given('the action PR diff is:', function (doc) {
  this.patchBody = trimDoc(doc)
  const st = mockState().github
  // later Given calls replace the diff route (Background sets a default one)
  st.requestRoutes = st.requestRoutes.filter((r) => !r.isDiffRoute)
  st.requestRoutes.push({
    isDiffRoute: true,
    match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'diff',
    reply: { data: this.patchBody }
  })
})

Given('no PR comments are routed', function () {
  const st = mockState().github
  st.graphqlRoutes = st.graphqlRoutes.filter((r) => !r.isCommentsRoute && !r.isDeleteRoute)
})

When('the action runs', async function () {
  const { default: action } = await import('../../action.cjs')
  const st = mockState().github
  if (!st.requestRoutes.some((r) => r.isPropsRoute)) {
    st.requestRoutes.push({
      isPropsRoute: true,
      match: (route) => route.includes('/properties/values'),
      reply: { data: [] }
    })
  }
  const context = {
    repo: { owner: this.owner, repo: this.repo },
    issue: { number: this.prnum },
    actor: this.actor ?? 'test-actor',
    payload: this.noPayload
      ? {}
      : {
          pull_request: {
            user: { login: this.prAuthor ?? this.actor ?? 'test-actor' },
            ...(this.prHeadSha ? { head: { sha: this.prHeadSha } } : {})
          }
        }
  }
  this.error = null
  this.result = undefined
  try {
    this.result = await action({
      github: this.github,
      context,
      inputs: this.actionInputs ?? {},
      actionPath: process.cwd()
    })
  } catch (err) {
    this.error = err
  }
})

Then('the puLL-Merge label was added', function () {
  const calls = mockState().github.restCalls['issues.addLabels']
  expect(calls).to.have.lengthOf(1)
  expect(calls[0]).to.deep.equal({
    owner: this.owner,
    repo: this.repo,
    issue_number: this.prnum,
    labels: ['puLL-Merge']
  })
})

Then('no labels were added', function () {
  expect(mockState().github.restCalls['issues.addLabels']).to.equal(undefined)
})

Then('a comment was created containing {string}', function (fragment) {
  const calls = mockState().github.restCalls['issues.createComment']
  expect(calls).to.have.lengthOf(1)
  expect(calls[0].body).to.contain(fragment)
})

Then('no comment was created containing {string}', function (fragment) {
  const calls = mockState().github.restCalls['issues.createComment'] ?? []
  expect(calls.some((call) => call.body.includes(fragment))).to.equal(false)
})

Then('the git toolchain was not invoked', function () {
  const entries = readGitRecord(this.gitRecordPath)
  expect(entries).to.deep.equal([])
})

Then('the git toolchain cloned {string}', function (url) {
  const entries = readGitRecord(this.gitRecordPath)
  const clone = entries.find((e) => e.argv[0] === 'clone')
  expect(clone).to.be.an('object')
  expect(clone.argv).to.deep.equal(['clone', '--bare', '--filter=blob:none', url, clone.argv[4]])
})

Then('the git toolchain fetched {string} and {string}', function (prev, head) {
  const entries = readGitRecord(this.gitRecordPath)
  const fetches = entries.filter((e) => e.argv[0] === '-C' && e.argv[2] === 'fetch')
  const shas = fetches.flatMap((e) => e.argv.slice(4))
  // head is fetched first, then the prev pin (which may not exist upstream)
  expect(shas).to.deep.equal([head, prev])
})

Then('the git toolchain diffed {string} to {string}', function (prev, head) {
  const entries = readGitRecord(this.gitRecordPath)
  const diff = entries.find((e) => e.argv.includes('diff'))
  expect(diff).to.be.an('object')
  expect(diff.argv[diff.argv.indexOf('diff') + 1]).to.equal(`${prev}..${head}`)
})

Then('it rejects with an error containing {string}', function (fragment) {
  expect(this.error).to.be.an('error')
  expect(this.error.message).to.contain(fragment)
})

When('the action options precedence property holds for {int} runs', async function (runs) {
  const { default: action } = await import('../../action.cjs')
  const context = {
    repo: { owner: 'o', repo: 'r' },
    issue: { number: 7 },
    actor: 'prop-actor',
    payload: { pull_request: { user: { login: 'prop-actor' } } }
  }
  const maxTokens = fc.integer({ min: 1, max: 999 })
  await fc.assert(fc.asyncProperty(maxTokens, async (tokens) => {
    resetState()
    const github = makeGithub()
    const st = mockState()
    st.github.requestRoutes.push({
      match: (route, opts) => route === PULLS_ROUTE && opts?.mediaType?.format === 'diff',
      reply: { data: 'the diff' }
    })
    st.github.requestRoutes.push({
      match: (route) => route === 'GET /repos/{owner}/{repo}',
      reply: { data: { private: false, visibility: 'public' } }
    })
    st.github.requestRoutes.push({
      isPropsRoute: true,
      match: (route) => route.includes('/properties/values'),
      reply: { data: [] }
    })
    st.github.graphqlRoutes.push({
      match: (q) => q.includes('comments(last: 100)'),
      reply: { repository: { pullRequest: { comments: { nodes: [] } } } }
    })
    st.tiktoken.count = () => 100000
    st.openai.chatResponse = { choices: [{ message: { content: 'review' } }] }
    const out = await action({
      github,
      context,
      inputs: { max_tokens: String(tokens) },
      actionPath: process.cwd()
    })
    expect(out).to.equal(undefined)
    const call = mockState().openai.chatCalls[0]
    expect(call.max_tokens).to.equal(tokens)
    expect(call.model).to.equal('gpt-5.3-codex')
  }), { numRuns: runs })
})
