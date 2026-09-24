import OpenAI from 'openai'
/* eslint-disable camelcase */
import { encoding_for_model, get_encoding } from 'tiktoken'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['gpt-5.3-codex'],
  system = SYSTEM_PROMPT,
  max_tokens = 16384,
  temperature = 1,
  top_p = 1,
  frequency_penalty = 0,
  presence_penalty = 0,
  amplification = 2,
  debug = false,
  include_diff = false,
  headSha = null
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

      // the chat endpoint is tried first; 404 invalid_request_error
      // responses classify into the responses or legacy completions
      // endpoints, every other API error is rethrown

      const chatAttempt = async (budget) => {
        const aiResponse = await openai.chat.completions.create({
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
          max_tokens: budget,
          top_p,
          frequency_penalty,
          presence_penalty
        })
        if (debug) {
          console.log(aiResponse)
          console.log(aiResponse.choices[0].message)
        }
        return {
          text: aiResponse.choices[0].message.content,
          truncated: aiResponse.choices[0].finish_reason === 'length',
          detail: 'finish_reason=length'
        }
      }

      const responsesAttempt = async (budget) => {
        // Codex / reasoning models only support the v1/responses endpoint.
        const aiResponse = await openai.responses.create({
          model,
          instructions: system,
          input: userPrompt,
          temperature,
          top_p,
          max_output_tokens: budget
        })
        if (debug) {
          console.log(aiResponse)
          console.log(aiResponse.output_text)
        }
        return {
          text: aiResponse.output_text,
          truncated: aiResponse.status === 'incomplete' &&
            aiResponse.incomplete_details?.reason === 'max_output_tokens',
          detail: 'incomplete_details=max_output_tokens'
        }
      }

      const completionsAttempt = async (budget) => {
        const prompt = `${system}\n\n${userPrompt}`
        const aiResponse = await openai.completions.create({
          model,
          prompt,
          temperature,
          max_tokens: budget,
          top_p,
          frequency_penalty,
          presence_penalty
        })
        if (debug) {
          console.log(aiResponse)
          console.log(aiResponse.choices[0].text)
        }
        return {
          text: aiResponse.choices[0].text,
          truncated: aiResponse.choices[0].finish_reason === 'length',
          detail: 'finish_reason=length'
        }
      }

      let budget = max_tokens
      for (;;) {
        let outcome
        try {
          outcome = await chatAttempt(budget)
        } catch (err) {
          const fallback = err.status === 404 && err.error?.type === 'invalid_request_error'
          if (!fallback) {
            throw err
          }
          // Codex / reasoning models only support the v1/responses endpoint.
          // The SDK returns this hint in the 404 error message.
          const wantsResponses = /v1\/responses/i.test(err.error?.message || err.message || '')
          outcome = wantsResponses
            ? await responsesAttempt(budget)
            : await completionsAttempt(budget)
        }
        if (!outcome.truncated) {
          return outcome.text
        }
        if (budget >= max_tokens * 2) {
          throw new Error(`Review response truncated at ${budget} output tokens (${outcome.detail})`)
        }
        console.log(`Review response truncated at ${budget} output tokens; retrying with ${budget * 2}`)
        budget *= 2
      }
    },
    headSha
  )
}
/* eslint-enable camelcase */
