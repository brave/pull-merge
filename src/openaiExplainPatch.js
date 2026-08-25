import OpenAI from 'openai'
/* eslint-disable camelcase */
import { encoding_for_model, get_encoding } from 'tiktoken'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['gpt-5.3-codex'],
  system = SYSTEM_PROMPT,
  max_tokens = 3072,
  temperature = 1,
  top_p = 1,
  frequency_penalty = 0,
  presence_penalty = 0,
  amplification = 2,
  debug = false,
  include_diff = false
}) {
  const openai = new OpenAI({ apiKey })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      let enc
      try {
        enc = encoding_for_model(model)
      } catch {
        enc = get_encoding('cl100k_base')
      }
      const pLen = enc.encode(patchBody).length

      if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
      if (pLen < amplification * max_tokens) {
        if (include_diff) {
          return ''
        }
        throw new Error('The patch is trivial, no need for a summarization')
      }

      let aiResponse
      try {
        aiResponse = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: system
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature,
          max_tokens,
          top_p,
          frequency_penalty,
          presence_penalty
        })
        if (debug) {
          console.log(aiResponse)
          console.log(aiResponse.choices[0].message)
        }
        return aiResponse.choices[0].message.content
      } catch (err) {
        // Codex / reasoning models only support the v1/responses endpoint.
        // The SDK returns this hint in the 404 error message.
        const wantsResponses = err.status === 404 &&
          err.error?.type === 'invalid_request_error' &&
          /v1\/responses/i.test(err.error?.message || err.message || '')

        if (wantsResponses) {
          aiResponse = await openai.responses.create({
            model,
            instructions: system,
            input: userPrompt,
            temperature,
            top_p,
            max_output_tokens: max_tokens
          })
          if (debug) {
            console.log(aiResponse)
            console.log(aiResponse.output_text)
          }
          return aiResponse.output_text
        }

        // Some base models are not chat models and must use the legacy
        // v1/completions endpoint instead.
        if (err.status === 404 && err.error?.type === 'invalid_request_error') {
          const prompt = `${system}\n\n${userPrompt}`
          aiResponse = await openai.completions.create({
            model,
            prompt,
            temperature,
            max_tokens,
            top_p,
            frequency_penalty,
            presence_penalty
          })
          if (debug) {
            console.log(aiResponse)
            console.log(aiResponse.choices[0].text)
          }
          return aiResponse.choices[0].text
        }
        throw err
      }
    }
  )
}
/* eslint-enable camelcase */
