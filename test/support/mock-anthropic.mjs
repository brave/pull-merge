import { mockState } from './state.mjs'

export default class Anthropic {
  constructor (opts) {
    mockState().anthropic.constructorArgs.push(opts)
    this.messages = {
      stream: (params) => {
        const st = mockState().anthropic
        st.streamCalls.push(params)
        return {
          finalText: async () => {
            if (st.streamError) throw st.streamError
            return st.streamText
          }
        }
      }
    }
  }
}
