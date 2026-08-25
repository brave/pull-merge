export const STATE_KEY = Symbol.for('pull-merge.mock-state')

export function freshState () {
  return {
    openai: {
      constructorArgs: [],
      chatCalls: [],
      completionCalls: [],
      chatResponse: { choices: [{ message: { content: '' } }] },
      chatError: null,
      completionResponse: { choices: [{ text: '' }] },
      completionError: null
    },
    anthropic: {
      constructorArgs: [],
      streamCalls: [],
      streamText: '',
      streamError: null,
      streamErrors: []
    },
    tokenizer: {
      count: () => 0
    },
    tiktoken: {
      count: () => 0,
      encodingForModelThrows: false,
      getEncodingCalls: [],
      encodeCalls: []
    },
    bedrock: {
      clientArgs: [],
      ssmArgs: [],
      ssmCalls: [],
      ssmParameter: null,
      ssmError: null,
      invocations: [],
      chunks: [],
      sendError: null,
      sendErrors: [],
      invalidChunk: false
    },
    octokit: {
      constructorArgs: []
    },
    markdown: {
      transform: null
    },
    github: {
      requestRoutes: [],
      graphqlRoutes: [],
      restReplies: {},
      requestCalls: [],
      graphqlCalls: [],
      restCalls: {}
    },
    fetchRoutes: [],
    fetchCalls: [],
    logs: []
  }
}

export function mockState () {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = freshState()
  }
  return globalThis[STATE_KEY]
}

export function resetState () {
  globalThis[STATE_KEY] = freshState()
  return globalThis[STATE_KEY]
}
