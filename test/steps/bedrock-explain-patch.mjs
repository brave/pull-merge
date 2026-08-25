/* eslint-disable camelcase */
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { mockState } from '../support/state.mjs'

async function callBedrock (world) {
  const { default: explainPatch } = await import('../../src/bedrockExplainPatch.js')
  world.error = null
  try {
    world.result = await explainPatch({
      patchBody: world.patchBody,
      owner: world.owner,
      repo: world.repo,
      ...(world.models ? { models: world.models } : {}),
      ...(world.maxTokens ? { max_tokens: world.maxTokens } : {}),
      ...(world.temperature !== undefined ? { temperature: world.temperature } : {}),
      ...(world.amplification ? { amplification: world.amplification } : {}),
      ...(world.region ? { region: world.region } : {}),
      include_diff: world.includeDiff ?? false,
      debug: world.debug ?? false
    })
  } catch (err) {
    world.error = err
  }
}

Given('an SSM inference profile {string}', function (arn) {
  mockState().bedrock.ssmParameter = { Parameter: { Value: arn } }
})

Given('the SSM parameter store fails with {string}', function (message) {
  mockState().bedrock.ssmError = new Error(message)
})

Given('the bedrock stream yields text {string}', function (text) {
  mockState().bedrock.chunks = [
    JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })
  ]
})

Given('the bedrock stream yields the events:', function (doc) {
  mockState().bedrock.chunks = doc.replace(/\n$/, '').split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
})

Given('the bedrock stream fails with {string}', function (message) {
  mockState().bedrock.sendError = new Error(message)
})

Given('the bedrock stream fails on the first {int} calls with {string}', function (count, message) {
  const st = mockState().bedrock
  for (let i = 0; i < count; i++) {
    st.sendErrors.push(new Error(message))
  }
})

Given('the bedrock stream includes an invalid chunk', function () {
  mockState().bedrock.invalidChunk = true
})

Given('region {string}', function (region) {
  this.region = region
})

When('bedrockExplainPatch is called', async function () {
  await callBedrock(this)
})

Then('{int} bedrock invocation was made', function (count) {
  expect(mockState().bedrock.invocations).to.have.lengthOf(count)
})

Then('{int} bedrock invocations were made', function (count) {
  expect(mockState().bedrock.invocations).to.have.lengthOf(count)
})

Then('bedrock invocation {int} used model {string}', function (index, model) {
  const invocation = mockState().bedrock.invocations[index - 1]
  expect(invocation.modelId).to.equal(model)
})

Then('bedrock invocation {int} used max tokens {int} and temperature {float}', function (index, maxTokens, temperature) {
  const invocation = mockState().bedrock.invocations[index - 1]
  const body = JSON.parse(invocation.body)
  expect(body.max_tokens).to.equal(maxTokens)
  expect(body.temperature).to.equal(temperature)
})

Then('bedrock invocation {int} carries the system and user prompts', async function (index) {
  const { SYSTEM_PROMPT } = await import('../../src/utils.js')
  const invocation = mockState().bedrock.invocations[index - 1]
  expect(invocation.contentType).to.equal('application/json')
  expect(invocation.accept).to.equal('application/json')
  const body = JSON.parse(invocation.body)
  expect(body.anthropic_version).to.equal('bedrock-2023-05-31')
  expect(body.system).to.equal(SYSTEM_PROMPT)
  expect(body.messages).to.have.lengthOf(1)
  expect(body.messages[0].role).to.equal('user')
  expect(body.messages[0].content).to.contain('Repository: https://github.com/brave/pull-merge')
  expect(body.messages[0].content).to.contain(`\`\`\`\n${this.patchBody}\n\`\`\``)
})

Then('the Bedrock clients were constructed for region {string}', function (region) {
  const st = mockState().bedrock
  expect(st.clientArgs).to.deep.equal([{ region }])
  expect(st.ssmArgs).to.deep.equal([{ region }])
})

Then('the SSM parameter {string} was requested', function (name) {
  expect(mockState().bedrock.ssmCalls).to.deep.equal([{ Name: name }])
})

Then('the failure was caused by the stream error', function () {
  expect(this.error).to.be.an('error')
  expect(this.error.cause).to.equal(mockState().bedrock.sendError)
})

Then('a log line containing {string} was recorded', function (fragment) {
  const logs = mockState().logs
  expect(logs.some((line) => line.includes(fragment))).to.equal(true)
})

When('the bedrock patch embedding property holds for {int} runs', async function (runs) {
  const { default: explainPatch } = await import('../../src/bedrockExplainPatch.js')
  const st = mockState()
  st.tokenizer.count = () => 100000
  st.bedrock.chunks = [
    JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'review' } })
  ]
  const patchBody = fc.array(fc.constantFrom('a', 'b', ' ', '\n', '+', '-', '@', '/'), { maxLength: 40 }).map((chars) => chars.join(''))
  await fc.assert(fc.asyncProperty(patchBody, async (body) => {
    const out = await explainPatch({ patchBody: body, owner: 'o', repo: 'r', models: ['global.anthropic.claude-opus-5-v1:0'] })
    const invocation = mockState().bedrock.invocations.at(-1)
    const bodyJson = JSON.parse(invocation.body)
    expect(bodyJson.messages[0].content).to.contain(`\`\`\`\n${body}\n\`\`\``)
    expect(out).to.equal('review\n</details>\n\n<!-- Generated by global.anthropic.claude-opus-5-v1:0 -->')
  }), { numRuns: runs })
})
