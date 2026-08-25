import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { makeGithub } from '../support/fake-github.mjs'
import { mockState } from '../support/state.mjs'

const trimDoc = (doc) => doc.replace(/\n$/, '')

Given('a github client', function () {
  this.github = makeGithub()
})

Given('a github token {string}', function (token) {
  this.githubToken = token
  this.github = null
})

Given('a config file {string} containing:', function (path, doc) {
  mockState().github.restReplies['repos.getContent'] = {
    data: { content: Buffer.from(trimDoc(doc)).toString('base64') }
  }
})

Given('the getContent endpoint fails with {string}', function (message) {
  mockState().github.restReplies['repos.getContent'] = new Error(message)
})

When('getConfig is called with path {string}', async function (path) {
  const { default: getConfig } = await import('../../src/getConfig.js')
  this.error = null
  try {
    this.result = await getConfig({
      owner: this.owner,
      repo: this.repo,
      path,
      github: this.github,
      githubToken: this.githubToken,
      debug: this.debug
    })
  } catch (err) {
    this.error = err
  }
})

Then('it resolves to:', function (doc) {
  expect(this.error).to.equal(null)
  expect(this.result).to.deep.equal(JSON.parse(trimDoc(doc)))
})

Then('getContent was called for owner {string} repo {string} path {string}', function (owner, repo, path) {
  const calls = mockState().github.restCalls['repos.getContent']
  expect(calls).to.have.lengthOf(1)
  expect(calls[0]).to.deep.equal({ owner, repo, path })
})

Then('the decoded content was logged', function () {
  const logs = mockState().logs
  expect(logs.some((line) => line.includes('"a": 1'))).to.equal(true)
})

Then('an Octokit client was constructed with auth {string}', function (auth) {
  const args = mockState().octokit.constructorArgs
  expect(args).to.have.lengthOf(1)
  expect(args[0]).to.deep.equal({ auth })
})

Given('repo properties:', function (table) {
  mockState().github.requestRoutes.push({
    match: (route) => /properties\/values/.test(route),
    reply: { data: table.hashes().map((row) => ({ property_name: row.property_name, value: row.value })) }
  })
})

Given('the properties endpoint fails with {string}', function (message) {
  mockState().github.requestRoutes.push({
    match: (route) => /properties\/values/.test(route),
    error: new Error(message)
  })
})

When('getProperties is called without a prefix', async function () {
  await callGetProperties(this, {})
})

When('getProperties is called with prefix {string}', async function (prefix) {
  await callGetProperties(this, { prefix })
})

async function callGetProperties (world, extra) {
  const { default: getProperties } = await import('../../src/getProperties.js')
  world.error = null
  try {
    world.result = await getProperties({
      owner: world.owner,
      repo: world.repo,
      github: world.github,
      githubToken: world.githubToken,
      debug: world.debug,
      ...extra
    })
  } catch (err) {
    world.error = err
  }
}

Then('the properties endpoint was requested for owner {string} repo {string}', function (owner, repo) {
  const calls = mockState().github.requestCalls
  expect(calls).to.have.lengthOf(1)
  expect(calls[0].route).to.equal('GET /repos/{owner}/{repo}/properties/values')
  expect(calls[0].opts).to.include({ owner, repo })
  expect(calls[0].opts.headers).to.deep.equal({ 'X-GitHub-Api-Version': '2022-11-28' })
})

Then('the raw properties response was logged', function () {
  expect(mockState().logs.some((line) => line.includes('property_name'))).to.equal(true)
})

When('the property merge semantics property holds for {int} runs', async function (runs) {
  const { default: getProperties } = await import('../../src/getProperties.js')
  const prefix = 'pull_merge_'
  let currentProps = []
  mockState().github.requestRoutes.push({
    match: (route) => /properties\/values/.test(route),
    reply: () => ({ data: currentProps })
  })
  const plainName = fc.string({ minLength: 1, maxLength: 8 })
    .filter((s) => !s.includes('pull_merge_'))
  const propertyName = fc.oneof(
    plainName,
    plainName.map((n) => prefix + n)
  )
  const property = fc.record({ property_name: propertyName, value: fc.string({ maxLength: 8 }) })
  const propertyList = fc.array(property, { maxLength: 8 })
  await fc.assert(fc.asyncProperty(propertyList, async (props) => {
    currentProps = props
    const out = await getProperties({ owner: 'o', repo: 'r', github: makeGithub(), prefix })
    const expected = {}
    for (const p of props) {
      if (!p.property_name.startsWith(prefix)) expected[p.property_name] = p.value
    }
    for (const p of props) {
      if (p.property_name.startsWith(prefix)) {
        expected[p.property_name.substring(prefix.length)] = p.value
      }
    }
    expect(out).to.deep.equal(expected)
  }), { numRuns: runs })
})
