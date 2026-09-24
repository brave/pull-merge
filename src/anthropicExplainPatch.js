import Anthropic from '@anthropic-ai/sdk'
import { countTokens } from '@anthropic-ai/tokenizer'
import { SYSTEM_PROMPT, TRIVIAL_PATCH_TOKENS, outputTokenLimit, explainPatchHelper } from './utils.js'

/* eslint-disable camelcase */
export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['claude-opus-5-5'],
  system = SYSTEM_PROMPT,
  max_tokens = 16384,
  temperature = 1,
  amplification = 2,
  debug = false,
  include_diff = false,
  headSha = null
}) {
  max_tokens = Number(max_tokens)
  const pLen = countTokens(patchBody)
  if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
  if (pLen < amplification * TRIVIAL_PATCH_TOKENS) {
    if (include_diff) {
      return ''
    }
    throw new Error('The patch is trivial, no need for a summarization')
  }

  const anthropic = new Anthropic({ apiKey })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      if (!(Number(max_tokens) > 0)) {
        throw new Error('max_tokens must be a positive number')
      }
      // A truncated review must never be posted: on stop_reason=max_tokens
      // retry once with a doubled budget; when the model rejects a budget
      // above its output cap, clamp to the advertised limit instead.
      let budget = max_tokens
      let ceiling = Infinity
      let retries = 0
      for (;;) {
        let final
        try {
          const stream = anthropic.messages.stream({
            max_tokens: budget,
            temperature,
            model,
            system,
            messages: [
              {
                role: 'user',
                content: userPrompt
              }
            ]
          })
          final = await stream.finalMessage()
        } catch (err) {
          const limit = outputTokenLimit(err, budget)
          if (limit === null || limit >= budget) {
            throw err
          }
          ceiling = limit
          budget = limit
          continue
        }
        const text = final.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('')
        if (debug) {
          console.log(text)
        }
        if (final.stop_reason !== 'max_tokens') {
          return text
        }
        if (retries >= 1) {
          throw new Error(`Review response truncated at ${budget} output tokens (stop_reason=max_tokens)`)
        }
        retries++
        const next = Math.min(budget * 2, ceiling)
        if (next <= budget) {
          throw new Error(`Review response truncated at ${budget} output tokens (stop_reason=max_tokens)`)
        }
        console.log(`Review response truncated at ${budget} output tokens; retrying with ${next}`)
        budget = next
      }
    },
    headSha
  )
}
/* eslint-enable camelcase */
