import Anthropic from '@anthropic-ai/sdk'
import { countTokens } from '@anthropic-ai/tokenizer'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

/* eslint-disable camelcase */
export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['claude-3-5-sonnet-20240620'],
  system = SYSTEM_PROMPT,
  max_tokens = 3072,
  temperature = 1,
  top_p = 1,
  amplification = 2,
  debug = false
}) {
  const pLen = countTokens(patchBody)
  if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
  if (pLen < amplification * max_tokens) {
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
        top_p,
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
