import Anthropic from '@anthropic-ai/sdk'
import { countTokens } from '@anthropic-ai/tokenizer'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

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
  const pLen = countTokens(patchBody)
  if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
  if (pLen < amplification * max_tokens) {
    if (include_diff) {
      return ''
    }
    throw new Error('The patch is trivial, no need for a summarization')
  }

  const anthropic = new Anthropic({ apiKey })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      // retry once with a doubled budget when the model hits the output
      // cap; a truncated review must never be posted
      let budget = max_tokens
      for (;;) {
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
        const final = await stream.finalMessage()
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
        if (budget >= max_tokens * 2) {
          throw new Error(`Review response truncated at ${budget} output tokens (stop_reason=max_tokens)`)
        }
        console.log(`Review response truncated at ${budget} output tokens; retrying with ${budget * 2}`)
        budget *= 2
      }
    },
    headSha
  )
}
/* eslint-enable camelcase */
