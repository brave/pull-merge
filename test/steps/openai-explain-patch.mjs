/* eslint-disable camelcase */
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { mockState } from '../support/state.mjs'

async function callOpenAI (world) {
  const { default: explainPatch } = await import('../../src/openaiExplainPatch.js')
  world.error = null
  try {
    world.result = await explainPatch({
      apiKey: world.apiKey ?? 'sk-test',
      patchBody: world.patchBody,
      owner: world.owner,
      repo: world.repo,
      models: world.models ?? ['test-model'],
      max_tokens: world.maxTokens ?? 3072,
      amplification: world.amplification ?? 2,
      include_diff: world.includeDiff ?? false,
      debug: world.debug ?? false
    })
  } catch (err) {
    world.error = err
  }
}

Given('the patch tokenizes to {int} tokens', function (count) {
  mockState().tiktoken.count = () => count
})

Given('max tokens {int}', function (maxTokens) {
  this.maxTokens = maxTokens
})

Given('the model is unknown to tiktoken', function () {
  mockState().tiktoken.encodingForModelThrows = true
})

Given('include_diff is on', function () {
  this.includeDiff = true
})

Given('the chat response content is {string}', function (content) {
  mockState().openai.chatResponse = { choices: [{ message: { content } }] }
})

Given('the legacy completion response text is {string}', function (text) {
  mockState().openai.completionResponse = { choices: [{ text }] }
})

Given('the chat endpoint fails with status {int} and message {string}', function (status, message) {
  mockState().openai.chatError = Object.assign(new Error(message), { status })
})

Given('the chat endpoint fails with status {int} type {string} and message {string}', function (status, type, message) {
  mockState().openai.chatError = Object.assign(new Error(message), { status, error: { type } })
})

When('openaiExplainPatch is called', async function () {
  await callOpenAI(this)
})

Then('{int} chat completion was called', function (count) {
  expect(mockState().openai.chatCalls).to.have.lengthOf(count)
})

Then('{int} chat completions were called', function (count) {
  expect(mockState().openai.chatCalls).to.have.lengthOf(count)
})

Then('{int} legacy completion was called', function (count) {
  expect(mockState().openai.completionCalls).to.have.lengthOf(count)
})

Then('{int} legacy completions were called', function (count) {
  expect(mockState().openai.completionCalls).to.have.lengthOf(count)
})

Then('chat request {int} used model {string} temperature {float} and max tokens {int}', function (index, model, temperature, maxTokens) {
  const call = mockState().openai.chatCalls[index - 1]
  expect(call.model).to.equal(model)
  expect(call.temperature).to.equal(temperature)
  expect(call.max_tokens).to.equal(maxTokens)
  expect(call.top_p).to.equal(1)
  expect(call.frequency_penalty).to.equal(0)
  expect(call.presence_penalty).to.equal(0)
})

Then('chat request {int} carries the system and user prompts', async function (index) {
  const { SYSTEM_PROMPT } = await import('../../src/utils.js')
  const call = mockState().openai.chatCalls[index - 1]
  expect(call.messages).to.have.lengthOf(2)
  expect(call.messages[0]).to.deep.equal({ role: 'system', content: SYSTEM_PROMPT })
  expect(call.messages[1].role).to.equal('user')
  expect(call.messages[1].content).to.contain('Repository: https://github.com/brave/pull-merge')
  expect(call.messages[1].content).to.contain(`\`\`\`\n${this.patchBody}\n\`\`\``)
})

Then('legacy request {int} prompts with the system prompt and the patch body', async function (index) {
  const { SYSTEM_PROMPT } = await import('../../src/utils.js')
  const call = mockState().openai.completionCalls[index - 1]
  expect(call.model).to.equal('test-model')
  expect(call.prompt.startsWith(`${SYSTEM_PROMPT}\n\n`)).to.equal(true)
  expect(call.prompt).to.contain(`\`\`\`\n${this.patchBody}\n\`\`\``)
  expect(call.temperature).to.equal(1)
  expect(call.max_tokens).to.equal(3072)
})

Then('the cl100k_base fallback encoding was requested', function () {
  expect(mockState().tiktoken.getEncodingCalls).to.include('cl100k_base')
})

Then('the OpenAI client was constructed with api key {string}', function (apiKey) {
  const args = mockState().openai.constructorArgs
  expect(args).to.have.lengthOf(1)
  expect(args[0]).to.deep.equal({ apiKey })
})

Then('the chat response was logged', function () {
  const logs = mockState().logs
  expect(logs.some((line) => line.includes('"content":"the review"'))).to.equal(true)
})

Then('the legacy response was logged', function () {
  const logs = mockState().logs
  expect(logs.some((line) => line.includes('"text":"legacy review"'))).to.equal(true)
  expect(logs.some((line) => line.includes('legacy review'))).to.equal(true)
})

When('the patch embedding property holds for {int} runs', async function (runs) {
  const { default: explainPatch } = await import('../../src/openaiExplainPatch.js')
  mockState().tiktoken.count = () => 100000
  mockState().openai.chatResponse = { choices: [{ message: { content: 'review' } }] }
  const patchBody = fc.array(fc.constantFrom('a', 'b', ' ', '\n', '+', '-', '@', '/'), { maxLength: 40 }).map((chars) => chars.join(''))
  await fc.assert(fc.asyncProperty(patchBody, async (body) => {
    const out = await explainPatch({ apiKey: 'sk-test', patchBody: body, owner: 'o', repo: 'r', models: ['test-model'] })
    const calls = mockState().openai.chatCalls
    const prompt = calls[calls.length - 1].messages[1].content
    expect(prompt).to.contain(`\`\`\`\n${body}\n\`\`\``)
    expect(out).to.equal('review\n</details>\n\n<!-- Generated by test-model -->')
  }), { numRuns: runs })
})
