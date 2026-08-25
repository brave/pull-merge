import { mockState } from './state.mjs'

export default class OpenAI {
  constructor (opts) {
    mockState().openai.constructorArgs.push(opts)
    this.chat = {
      completions: {
        create: async (params) => {
          const st = mockState().openai
          st.chatCalls.push(params)
          if (st.chatError) throw st.chatError
          return st.chatResponse
        }
      }
    }
    this.completions = {
      create: async (params) => {
        const st = mockState().openai
        st.completionCalls.push(params)
        if (st.completionError) throw st.completionError
        return st.completionResponse
      }
    }
  }
}
