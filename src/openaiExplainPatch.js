import OpenAI from 'openai'
/* eslint-disable camelcase */
import { encoding_for_model } from 'tiktoken'
import { SYSTEM_PROMPT, explainPatchHelper } from './utils.js'

export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['gpt-4-0125-preview', 'gpt-3.5-turbo-0125'],
  system = SYSTEM_PROMPT,
  max_tokens = 2048,
  temperature = 1,
  top_p = 1,
  frequency_penalty = 0,
  presence_penalty = 0,
  amplification = 2,
  debug = false
}) {
  const openai = new OpenAI({ apiKey })

  return await explainPatchHelper(
    patchBody, owner, repo, models, debug,
    async (userPrompt, model) => {
      const enc = encoding_for_model(model)
      const pLen = enc.encode(patchBody).length

      if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
      if (pLen < amplification * max_tokens) { throw new Error('The patch is trivial, no need for a summarization') }

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
    }
  )
}
/* eslint-enable camelcase */
