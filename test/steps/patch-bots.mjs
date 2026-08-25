import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { makeGithub } from '../support/fake-github.mjs'
import { mockState, resetState } from '../support/state.mjs'

const trimDoc = (doc) => doc.replace(/\n$/, '')

const isPRBodyQuery = (q) => q.includes('PRBody')
const isTagsQuery = (q) => q.includes('Tags')

function ensureTagsRoute (world) {
  const st = mockState().github
  if (st.graphqlRoutes.some((r) => r.isTagsRoute)) return
  st.graphqlRoutes.push({
    isTagsRoute: true,
    match: isTagsQuery,
    reply: (variables) => {
      const names = world.tags[`${variables.owner}/${variables.name}`] || []
      return { repository: { refs: { nodes: names.map((name) => ({ name })) } } }
    }
  })
}

Given('the PR body:', function (doc) {
  this.prBody = trimDoc(doc)
  const st = mockState().github
  st.graphqlRoutes = st.graphqlRoutes.filter((r) => !r.isPRBodyRoute)
  st.graphqlRoutes.push({
    isPRBodyRoute: true,
    match: isPRBodyQuery,
    reply: { repository: { pullRequest: { body: this.prBody } } }
  })
})

Given('the repo {string} has tags:', function (repoPath, doc) {
  const [owner, repo] = repoPath.split('/')
  this.tags = this.tags || {}
  this.tags[`${owner}/${repo}`] = trimDoc(doc).split('\n').filter(Boolean)
  ensureTagsRoute(this)
})

Given('the compare diff at {string} responds with:', function (url, doc) {
  mockState().fetchRoutes.push({ match: (u) => u === url, body: trimDoc(doc) })
})

Given('the compare diff at {string} responds with status {int} {string}', function (url, status, statusText) {
  mockState().fetchRoutes.push({ match: (u) => u === url, status, statusText })
})

Given('markdownToTxt strips backticks', function () {
  mockState().markdown.transform = (text) => text.replace(/`/g, '')
})

async function callPatchModule (world, name) {
  const { default: fn } = await import(`../../src/${name}.js`)
  world.error = null
  world.result = undefined
  try {
    world.result = await fn({
      owner: world.owner,
      repo: world.repo,
      prnum: world.prnum,
      githubToken: world.githubToken ?? null,
      github: world.github ?? null,
      debug: world.debug ?? false
    })
  } catch (err) {
    world.error = err
  }
}

When('getDependabotPatch is called', async function () {
  await callPatchModule(this, 'getDependabotPatch')
})

When('getRenovatePatch is called', async function () {
  await callPatchModule(this, 'getRenovatePatch')
})

Then('the diff was fetched from {string}', function (url) {
  const calls = mockState().fetchCalls
  expect(calls).to.have.lengthOf(1)
  expect(calls[0].url).to.equal(url)
})

Then('it resolves to undefined', function () {
  expect(this.error).to.equal(null)
  expect(this.result).to.equal(undefined)
})

When('the dependabot patch property holds for {int} runs', async function (runs) {
  const { default: getDependabotPatch } = await import('../../src/getDependabotPatch.js')
  const name = fc.stringMatching(/^[a-z]{1,6}$/)
  const property = fc.asyncProperty(name, name, fc.nat(99), fc.nat(99), async (org, repo, a, b) => {
    resetState()
    const from = `1.${a}.0`
    const to = `1.${b}.0`
    const link = `https://github.com/${org}/${repo}`
    const diffUrl = `${link}/compare/v${from}..v${to}.diff`
    const github = makeGithub()
    mockState().github.graphqlRoutes.push({
      match: isPRBodyQuery,
      reply: { repository: { pullRequest: { body: `Bumps [pkg](${link}) from ${from} to ${to}.` } } }
    })
    mockState().github.graphqlRoutes.push({
      match: isTagsQuery,
      reply: () => ({ repository: { refs: { nodes: [{ name: `v${from}` }, { name: `v${to}` }] } } })
    })
    mockState().fetchRoutes.push({ match: (u) => u === diffUrl, body: 'DIFF' })
    const result = await getDependabotPatch({ owner: 'o', repo: 'r', prnum: 1, github })
    expect(result.owner).to.equal(org)
    expect(result.repo).to.equal(repo)
    expect(result.type).to.equal('dependabot')
    expect(result.body).to.equal('DIFF')
    expect(result.watermark).to.contain(`${org}/${repo}@v${from}..v${to}`)
    expect(result.watermark).to.contain(diffUrl)
    expect(mockState().fetchCalls[0].url).to.equal(diffUrl)
  })
  await fc.assert(property, { numRuns: runs })
})

When('the renovate patch property holds for {int} runs', async function (runs) {
  const { default: getRenovatePatch } = await import('../../src/getRenovatePatch.js')
  const name = fc.stringMatching(/^[a-z]{1,6}$/)
  const property = fc.asyncProperty(name, name, fc.nat(99), fc.nat(99), async (org, repo, a, b) => {
    resetState()
    const from = `1.${a}.0`
    const to = `1.${b}.0`
    const link = `https://github.com/${org}/${repo}`
    const diffUrl = `${link}/compare/v${from}..v${to}.diff`
    const body = [
      'This PR contains the following updates:',
      '',
      '| Package | Change |',
      '|---|---|',
      `| [pkg](https://redirect.github.com/${org}/${repo}) | ${from} -> ${to} |`
    ].join('\n')
    const github = makeGithub()
    mockState().github.graphqlRoutes.push({
      match: isPRBodyQuery,
      reply: { repository: { pullRequest: { body } } }
    })
    mockState().github.graphqlRoutes.push({
      match: isTagsQuery,
      reply: () => ({ repository: { refs: { nodes: [{ name: `v${from}` }, { name: `v${to}` }] } } })
    })
    mockState().fetchRoutes.push({ match: (u) => u === diffUrl, body: 'DIFF' })
    const result = await getRenovatePatch({ owner: 'o', repo: 'r', prnum: 1, github })
    expect(result.owner).to.equal(org)
    expect(result.repo).to.equal(repo)
    expect(result.type).to.equal('renovate')
    expect(result.body).to.equal('DIFF')
    expect(result.watermark).to.contain(`${org}/${repo}@v${from}..v${to}`)
    expect(result.watermark).to.contain(diffUrl)
    expect(mockState().fetchCalls[0].url).to.equal(diffUrl)
  })
  await fc.assert(property, { numRuns: runs })
})
