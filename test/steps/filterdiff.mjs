import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { mockState } from '../support/state.mjs'

Given('the filterdiff shim records its invocation to a state file', function () {
  this.recordPath = path.join(tmpdir(), `pm-filterdiff-record-${process.pid}-${Date.now()}.json`)
  process.env.PM_RECORD = this.recordPath
})

Given('the filterdiff shim writes {string} to stderr', function (stderr) {
  process.env.PM_STDERR = stderr
})

Given('the filterdiff shim outputs {string}', function (output) {
  process.env.PM_OUTPUT = output
})

async function readRecord (world) {
  const raw = await readFile(world.recordPath, 'utf8')
  return JSON.parse(raw)
}

When('filterdiff is called with content {string}', async function (content) {
  await callFilterdiff(this, { content })
})

When('filterdiff is called with content {string} and args string {string}', async function (content, args) {
  await callFilterdiff(this, { content, args })
})

When('filterdiff is called with content {string} and args array {string}', async function (content, args) {
  await callFilterdiff(this, { content, args: args ? args.split(',') : [] })
})

When('filterdiff is called with content {string} and args string {string} and debug on', async function (content, args) {
  await callFilterdiff(this, { content, args, debug: true })
})

async function callFilterdiff (world, params) {
  const filterdiff = await import('../../src/filterdiff.js')
  world.error = null
  world.result = undefined
  try {
    world.result = await filterdiff.default(params)
  } catch (err) {
    world.error = err
  }
}

Then('the shim received argv {string}', async function (argv) {
  const record = await readRecord(this)
  expect(record.argv).to.deep.equal(argv === '' ? [] : argv.split(' '))
})

Then('the shim received stdin {string}', async function (stdin) {
  const record = await readRecord(this)
  expect(record.stdin).to.equal(stdin)
})

Then('filterdiff resolves to the echoed content', function () {
  expect(this.error).to.equal(null)
  expect(this.result).to.equal('diff --git a/x b/x')
})

Then('filterdiff resolves to {string}', function (expected) {
  expect(this.error).to.equal(null)
  expect(this.result).to.equal(expected)
})

Then('filterdiff rejects with {string}', function (message) {
  expect(this.error).to.be.an('error')
  expect(this.error.message).to.equal(message)
})

Then('{string} was logged', function (message) {
  expect(mockState().logs.some((line) => line.includes(message))).to.equal(true)
})

When('the filterdiff echo identity property holds for {int} runs', async function (runs) {
  const filterdiff = await import('../../src/filterdiff.js')
  delete process.env.PM_OUTPUT
  delete process.env.PM_STDERR
  const content = fc.string({ minLength: 0, maxLength: 200 }, false)
  await fc.assert(fc.asyncProperty(content, async (text) => {
    const out = await filterdiff.default({ content: text })
    expect(out).to.equal(text)
  }), { numRuns: runs })
})

Then('cleanup', async function () {
  if (this.recordPath) await rm(this.recordPath, { force: true })
})
