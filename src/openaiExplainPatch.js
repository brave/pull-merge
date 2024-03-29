import OpenAI from 'openai'
/* eslint-disable camelcase */
import { encoding_for_model } from 'tiktoken'

export default async function explainPatch ({
  apiKey, patchBody, owner, repo,
  models = ['gpt-4-0125-preview', 'gpt-3.5-turbo-0125'],
  system = `
You are an expert software engineer reviewing a pull request on Github. Lines that start with "+" have been added, lines that start with "-" have been deleted. Use markdown for formatting your review.

Desired format:
### Description
<description_of_PR> // How does this PR change the codebase? What is the motivation for this change?

### Changes
<list_of_changes> // Describe the main changes in the PR, organizing them by filename

### Security Hotspots
<list_of_security_hotspots> // Describe locations for possible vulnerabilities in the change, order by risk
\n`,
  max_tokens = 2048,
  temperature = 1,
  top_p = 1,
  frequency_penalty = 0,
  presence_penalty = 0,
  amplification = 2,
  debug = false
}) {
  const openai = new OpenAI({ apiKey })
  const realModels = Array.isArray(models) ? models : models.split(' ')
  const userPrompt = `Repository: https://github.com/${owner}/${repo}\n\nThis is the PR diff\n\`\`\`\n${patchBody}\n\`\`\``

  if (debug) {
    console.log(`user_prompt:\n\n${userPrompt}`)
  }

  let m = null
  let enc
  let pLen

  for (let i = 0; i < realModels.length; i++) {
    try {
      m = realModels[i]
      enc = encoding_for_model(m)
      pLen = enc.encode(patchBody).length
      if (pLen === 0) { throw new Error('The patch is empty, cannot summarize!') }
      if (pLen < amplification * max_tokens) { throw new Error('The patch is trivial, no need for a summarization') }
      var aiResponse = await openai.chat.completions.create({
        model: m,
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
      break
    } catch (e) {
      if (i + 1 === realModels.length) {
        // last model
        throw e
      }

      console.log(e)
      continue
    }
  }

  if (debug) {
    console.log(aiResponse)
    console.log(aiResponse.choices[0].message)
  }

  let response = aiResponse.choices[0].message.content

  response = response.replaceAll('### Changes', '<details>\n<summary><i>Changes</i></summary>\n\n### Changes')
  response = response.replaceAll('### Security Hotspots', '</details>\n\n### Security Hotspots')
  response += `\n\n<!-- Generated by ${m} -->`

  return response
}
/* eslint-enable camelcase */
