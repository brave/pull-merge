import { mockState } from './state.mjs'

export class BedrockRuntimeClient {
  constructor (opts) {
    mockState().bedrock.clientArgs.push(opts)
  }

  async send (command) {
    const st = mockState().bedrock
    st.invocations.push(command.input)
    const queued = st.sendErrors.shift()
    if (queued) throw queued
    if (st.sendError) throw st.sendError
    const encoder = new TextEncoder()
    const chunks = st.chunks.map(c => ({ chunk: { bytes: encoder.encode(c) } }))
    if (st.invalidChunk) {
      chunks.push({ notChunk: true })
    }
    return {
      body: (async function * () {
        for (const chunk of chunks) {
          yield chunk
        }
      })()
    }
  }
}

export class InvokeModelWithResponseStreamCommand {
  constructor (input) {
    this.input = input
  }
}

export class SSMClient {
  constructor (opts) {
    mockState().bedrock.ssmArgs.push(opts)
  }

  async send (command) {
    const st = mockState().bedrock
    st.ssmCalls.push(command.input)
    if (st.ssmError) throw st.ssmError
    return st.ssmParameter
  }
}

export class GetParameterCommand {
  constructor (input) {
    this.input = input
  }
}
