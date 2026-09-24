import OpenAI from 'openai'
/* eslint-disable camelcase */
import { encoding_for_model, get_encoding } from 'tiktoken'
import { SYSTEM_PROMPT, TRIVIAL_PATCH_TOKENS, outputTokenLimit, explainPatchHelper } from './utils.js'

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
  max_tokens = Number(max_tokens)
  const openai = new OpenAI({ apiKey })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      if (!(Number(max_tokens) > 0)) {
        throw new Error('max_tokens must be a positive number')
      }
      let enc
      try {
        enc = encoding_for_model(model)
      } catch {
        enc = get_encoding('cl100k_base')
      }
      const pLen = enc.encode(patchBody).length

      if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
      if (pLen < amplification * TRIVIAL_PATCH_TOKENS) {
        if (include_diff) {
          return ''
        }
        throw new Error('The patch is trivial, no need for a summarization')
      }

      // the chat endpoint is tried first; 404 invalid_request_error
      // responses classify into the responses or legacy completions
      // endpoint and the choice is cached so retries skip the doomed
      // chat call; every other API error is rethrown

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
        // mocks omit finish_reason; the real API always sets it
        const finish = aiResponse.choices[0].finish_reason ?? 'stop'
        if (finish === 'length') {
          return {
            text: aiResponse.choices[0].message.content,
            truncated: true,
            detail: 'finish_reason=length'
          }
        }
        // content_filter and any unexpected finish reason leave the
        // response unusable; more tokens cannot fix either
        if (finish !== 'stop') {
          throw new Error(`Review response interrupted (finish_reason=${finish})`)
        }
        return {
          text: aiResponse.choices[0].message.content,
          truncated: false,
          detail: finish
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
        if (aiResponse.status === 'incomplete') {
          const reason = aiResponse.incomplete_details?.reason
          if (reason === 'max_output_tokens') {
            return {
              text: aiResponse.output_text,
              truncated: true,
              detail: 'incomplete_details=max_output_tokens'
            }
          }
          // any other incompleteness (content_filter, ...) cannot be
          // fixed with more tokens
          throw new Error(`Review response incomplete (incomplete_details=${reason})`)
        }
        return {
          text: aiResponse.output_text,
          truncated: false,
          detail: aiResponse.status
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
        const finish = aiResponse.choices[0].finish_reason ?? 'stop'
        if (finish === 'length') {
          return {
            text: aiResponse.choices[0].text,
            truncated: true,
            detail: 'finish_reason=length'
          }
        }
        if (finish !== 'stop') {
          throw new Error(`Review response interrupted (finish_reason=${finish})`)
        }
        return {
          text: aiResponse.choices[0].text,
          truncated: false,
          detail: finish
        }
      }

      let endpoint = 'chat'
      let budget = max_tokens
      let ceiling = Infinity
      let retries = 0
      const attemptFor = async (budget) => {
        if (endpoint === 'responses') return await responsesAttempt(budget)
        if (endpoint === 'completions') return await completionsAttempt(budget)
        return await chatAttempt(budget)
      }
      for (;;) {
        let outcome
        try {
          outcome = await attemptFor(budget)
        } catch (err) {
          const limit = outputTokenLimit(err, budget)
          if (limit !== null && limit < budget) {
            ceiling = limit
            budget = limit
            continue
          }
          if (endpoint === 'chat' && err.status === 404 && err.error?.type === 'invalid_request_error') {
            // Codex / reasoning models only support the v1/responses
            // endpoint. The SDK returns this hint in the 404 message.
            // The hop happens at most once per model; reclassify and
            // retry through the loop so cap errors thrown by the
            // fallback endpoint clamp too.
            endpoint = /v1\/responses/i.test(err.error?.message || err.message || '')
              ? 'responses'
              : 'completions'
            continue
          }
          throw err
        }
        if (!outcome.truncated) {
          return outcome.text
        }
        if (retries >= 1) {
          throw new Error(`Review response truncated at ${budget} output tokens (${outcome.detail})`)
        }
        retries++
        const next = Math.min(budget * 2, ceiling)
        if (next <= budget) {
          throw new Error(`Review response truncated at ${budget} output tokens (${outcome.detail})`)
        }
        console.log(`Review response truncated at ${budget} output tokens; retrying with ${next}`)
        budget = next
      }
    },
    headSha
  )
}
/* eslint-enable camelcase */
