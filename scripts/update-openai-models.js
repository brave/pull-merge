import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

async function fetchLatestModels () {
  const response = await fetch('https://platform.openai.com/docs/models')
  const html = await response.text()

  // Extract the latest model identifiers from the HTML
  // Looking for patterns like:
  // - gpt-5.3-codex (without date)
  // - gpt-4o-2024-05-13 (with date)
  // - gpt-3.5-turbo-0125 (turbo with version)

  const models = {}

  // Match GPT-5.3-Codex (prioritize this model)
  const codexPattern = /gpt-5\.3-codex/gi
  const codexMatch = html.match(codexPattern)
  if (codexMatch) {
    models.codex = codexMatch[0].toLowerCase()
  }

  // Match GPT-4o models (with dates)
  const gpt4oPattern = /gpt-4o-\d{4}-\d{2}-\d{2}/g
  const gpt4oMatch = html.match(gpt4oPattern)
  if (gpt4oMatch) {
    models.gpt4o = gpt4oMatch[0]
  }

  // Match GPT-3.5-turbo models
  const gpt35Pattern = /gpt-3\.5-turbo-\d{4}/g
  const gpt35Match = html.match(gpt35Pattern)
  if (gpt35Match) {
    models.gpt35 = gpt35Match[0]
  }

  // If we didn't find models from HTML, use hardcoded latest known models
  if (Object.keys(models).length === 0) {
    console.warn('Warning: Could not find model identifiers in OpenAI documentation, using hardcoded defaults')
    models.codex = 'gpt-5.3-codex'
    models.gpt4o = 'gpt-4o-2024-05-13'
    models.gpt35 = 'gpt-3.5-turbo-0125'
  }

  return models
}

async function updateFile (filePath, updates) {
  const content = await readFile(filePath, 'utf-8')
  let updatedContent = content

  for (const { search, replace } of updates) {
    updatedContent = updatedContent.replace(search, replace)
  }

  if (content !== updatedContent) {
    await writeFile(filePath, updatedContent, 'utf-8')
    return true
  }

  return false
}

async function main () {
  try {
    console.log('Fetching latest OpenAI model identifiers...')
    const models = await fetchLatestModels()

    // Display found models
    console.log('Latest OpenAI models:')
    if (models.codex) {
      console.log(`  GPT-5.3-Codex: ${models.codex}`)
    }
    if (models.gpt4o) {
      console.log(`  GPT-4o: ${models.gpt4o}`)
    }
    if (models.gpt35) {
      console.log(`  GPT-3.5-turbo: ${models.gpt35}`)
    }

    let hasChanges = false

    // Use GPT-5.3-Codex as the only model
    const primaryModel = models.codex || models.gpt4o

    if (!primaryModel) {
      throw new Error('No models found to set as default')
    }

    // Update action.cjs
    console.log('\nUpdating action.cjs...')
    const actionUpdated = await updateFile(
      join(rootDir, 'action.cjs'),
      [
        {
          search: /openai_models: '[^']+'/,
          replace: `openai_models: '${primaryModel}'`
        }
      ]
    )
    if (actionUpdated) {
      console.log('✓ Updated action.cjs')
      hasChanges = true
    } else {
      console.log('- No changes needed in action.cjs')
    }

    // Update openaiExplainPatch.js
    console.log('\nUpdating openaiExplainPatch.js...')
    const openaiUpdated = await updateFile(
      join(rootDir, 'src/openaiExplainPatch.js'),
      [
        {
          search: /models = \[(?:'gpt-[^']+',?\s*)+\]/,
          replace: `models = ['${primaryModel}']`
        }
      ]
    )
    if (openaiUpdated) {
      console.log('✓ Updated openaiExplainPatch.js')
      hasChanges = true
    } else {
      console.log('- No changes needed in openaiExplainPatch.js')
    }

    if (hasChanges) {
      console.log('\n✓ Model identifiers updated successfully')
      process.exit(0)
    } else {
      console.log('\n✓ All model identifiers are already up to date')
      process.exit(1) // Exit with code 1 to signal no changes
    }
  } catch (error) {
    console.error('Error updating models:', error)
    process.exit(1)
  }
}

main()
