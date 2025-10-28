import Anthropic from '@anthropic-ai/sdk'
import { countTokens } from '@anthropic-ai/tokenizer'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

/* eslint-disable camelcase */
export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['claude-sonnet-4-20250514'],
  system = SYSTEM_PROMPT,
  max_tokens = 3072,
  temperature = 1,
  amplification = 2,
  debug = false,
  include_diff = false
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
      const aiResponse = await anthropic.messages.create({
        max_tokens,
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
      const response = aiResponse.content
      if (debug) {
        console.log(response)
      }
      return response[0].text
    }
  )
}
/* eslint-enable camelcase */
