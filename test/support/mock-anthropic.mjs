import { mockState } from './state.mjs'

export default class Anthropic {
  constructor (opts) {
    mockState().anthropic.constructorArgs.push(opts)
    this.messages = {
      stream: (params) => {
        const st = mockState().anthropic
        st.streamCalls.push(params)
        return {
          finalMessage: async () => {
            if (st.streamErrors.length > 0) {
              const err = st.streamErrors.shift()
              if (err) throw err
            }
            if (st.streamError) throw st.streamError
            const text = st.streamTexts.length > 0 ? st.streamTexts.shift() : st.streamText
            const stopReason = st.streamStops.length > 0 ? st.streamStops.shift() : st.streamStop
            return {
              content: [{ type: 'text', text }],
              stop_reason: stopReason
            }
          }
        }
      }
    }
  }
}
