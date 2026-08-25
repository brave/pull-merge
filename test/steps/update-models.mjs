import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockState } from '../support/state.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

Given('the docs page at {string} contains:', function (url, docstring) {
  mockState().fetchRoutes.push({ match: (u) => u === url, body: docstring })
})

Given('the docs page at {string} is unreachable', function (url) {
  mockState().fetchRoutes.push({ match: (u) => u === url, error: new Error('docs unreachable') })
})

When('the anthropic script module is imported', async function () {
  this.mod = await import('../../scripts/update-anthropic-models.js')
})

When('the openai script module is imported', async function () {
  this.mod = await import('../../scripts/update-openai-models.js')
})

When('anthropic fetchLatestModels is called', async function () {
  this.error = null
  try {
    this.result = await this.mod.fetchLatestModels()
  } catch (err) {
    this.error = err
  }
})

When('openai fetchLatestModels is called', async function () {
  this.error = null
  try {
    this.result = await this.mod.fetchLatestModels()
  } catch (err) {
    this.error = err
  }
})

When('anthropic main is called', async function () {
  await this.mod.main()
})

When('openai main is called', async function () {
  await this.mod.main()
})

Then('compareModelVersions ranks {string} and {string} as {string}', function (a, b, expected) {
  const sign = Math.sign(this.mod.compareModelVersions(a, b))
  const actual = sign < 0 ? 'less' : sign > 0 ? 'greater' : 'equal'
  expect(actual).to.equal(expected)
})

Then('isSquashedVersion flags {string} among:', function (match, docstring) {
  const allMatches = docstring.split('\n').map((line) => line.trim()).filter(Boolean)
  expect(this.mod.isSquashedVersion(match, allMatches)).to.equal(true)
})

Then('isSquashedVersion keeps {string} among:', function (match, docstring) {
  const allMatches = docstring.split('\n').map((line) => line.trim()).filter(Boolean)
  expect(this.mod.isSquashedVersion(match, allMatches)).to.equal(false)
})
Then('the anthropic version ordering property holds for {int} runs', function (runs) {
  const cmp = this.mod.compareModelVersions
  const modelArb = fc.stringMatching(/^[a-z]{1,6}-\d{1,2}-\d{1,2}$/)
  fc.assert(fc.property(fc.array(modelArb, { minLength: 1, maxLength: 10 }), (models) => {
    for (let i = 0; i < models.length; i++) {
      for (let j = 0; j < models.length; j++) {
        expect(Math.sign(cmp(models[i], models[j]))).to.equal(-Math.sign(cmp(models[j], models[i])))
      }
    }
    const sorted = [...models].sort(cmp)
    expect(cmp(sorted[sorted.length - 1], sorted[0])).to.be.at.least(0)
  }), { numRuns: runs })
})

Then('the process exited with code {int}', function (code) {
  const calls = mockState().scripts.exitCalls
  expect(calls, `exit calls: ${JSON.stringify(calls)}`).to.have.lengthOf.at.least(1)
  expect(calls[calls.length - 1]).to.equal(code)
})

Then('the process did not exit', function () {
  expect(mockState().scripts.exitCalls).to.have.lengthOf(0)
})

Then('the file {string} was written containing:', function (rel, fragment) {
  const abs = path.resolve(repoRoot, rel)
  const write = mockState().fs.writes.find((w) => w.filePath === abs)
  expect(write, `expected a captured write to ${abs}`).to.not.equal(undefined)
  expect(write.content).to.contain(fragment)
})

Then('the file {string} was not written', function (rel) {
  const abs = path.resolve(repoRoot, rel)
  expect(mockState().fs.writes.find((w) => w.filePath === abs), `expected no write to ${abs}`).to.equal(undefined)
})

Then('no fetch was made', function () {
  expect(mockState().fetchCalls).to.have.lengthOf(0)
})
