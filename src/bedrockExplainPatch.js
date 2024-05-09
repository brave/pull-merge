import { countTokens as anthropicCountTokens } from '@anthropic-ai/tokenizer'
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

const COUNT_TOKENS_HASHFUN = {
  'amazon.titan-text-express-v1': null,
  'amazon.titan-text-lite-v1': null,
  'amazon.titan-embed-text-v1': null,
  'amazon.titan-embed-image-v1': null,
  'amazon.titan-image-generator-v1': null,
  'anthropic.claude-v2': anthropicCountTokens,
  'anthropic.claude-v2:1': anthropicCountTokens,
  'anthropic.claude-3-sonnet-20240229-v1:0': anthropicCountTokens,
  'anthropic.claude-3-haiku-20240307-v1:0': anthropicCountTokens,
  'anthropic.claude-3-opus-20240229-v1:0': anthropicCountTokens,
  'anthropic.claude-instant-v1': anthropicCountTokens,
  'ai21.j2-mid-v1': null,
  'ai21.j2-ultra-v1': null,
  'cohere.command-text-v14': null,
  'cohere.command-light-text-v14': null,
  'cohere.embed-english-v3': null,
  'cohere.embed-multilingual-v3': null,
  'meta.llama2-13b-chat-v1': null,
  'meta.llama2-70b-chat-v1': null,
  'meta.llama3-8b-instruct-v1:0': null,
  'meta.llama3-70b-instruct-v1:0': null,
  'mistral.mistral-7b-instruct-v0:2': null,
  'mistral.mixtral-8x7b-instruct-v0:1': null,
  'mistral.mistral-large-2402-v1:0': null,
  'stability.stable-diffusion-xl-v0': null,
  'stability.stable-diffusion-xl-v1': null
}

const countTokens = (text, modelId) => {
  if (COUNT_TOKENS_HASHFUN[modelId]) {
    return COUNT_TOKENS_HASHFUN[modelId](text)
  }

  throw new Error(`Model ${modelId} not supported for token counting`)
}

/* eslint-disable camelcase */
export default async function explainPatch ({
  patchBody, owner, repo,
  models = ['anthropic.claude-3-opus-20240229-v1:0'],
  system = SYSTEM_PROMPT,
  max_tokens = 2048,
  temperature = 1,
  top_p = 1,
  amplification = 2,
  region = 'us-east-1',
  debug = false
}) {
  const client = new BedrockRuntimeClient({ region })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      const pLen = countTokens(patchBody, model)

      if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
      if (pLen < amplification * max_tokens) { throw new Error('The patch is trivial, no need for a summarization') }

      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens,
          temperature,
          top_p,
          system,
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ]
        })
      })

      const rawResonse = await client.send(command)
      const textResponse = new TextDecoder().decode(rawResonse.body)
      if (debug) {
        console.log(`response:\n\n${textResponse}`)
      }
      const response = JSON.parse(textResponse)
      if (debug) {
        console.log(response)
      }
      return response.content[0].text
    }
  )
}
/* eslint-enable camelcase */
