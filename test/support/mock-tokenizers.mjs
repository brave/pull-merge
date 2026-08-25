/* eslint-disable camelcase */
import { mockState } from './state.mjs'

export function countTokens (text) {
  return mockState().tokenizer.count(text)
}

export function encoding_for_model (model) {
  const st = mockState().tiktoken
  if (st.encodingForModelThrows) {
    throw new Error(`Unknown model ${model}`)
  }
  return makeEncoding()
}

export function get_encoding (name) {
  mockState().tiktoken.getEncodingCalls.push(name)
  return makeEncoding()
}

function makeEncoding () {
  const st = mockState().tiktoken
  return {
    encode: (text) => {
      st.encodeCalls.push(text)
      return new Array(st.count(text)).fill(0)
    }
  }
}
