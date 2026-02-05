import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

async function fetchLatestModels () {
  const response = await fetch('https://docs.claude.com/en/docs/about-claude/models/overview')
  const html = await response.text()

  // Extract the latest model identifiers from the HTML for Sonnet, Haiku, and Opus
  // Looking for patterns like:
  // - claude-{sonnet|haiku|opus}-4-6 (version without date)
  // - claude-{sonnet|haiku|opus}-4-20250514 (single version with date)
  // - claude-{sonnet|haiku|opus}-4-5-20250929 (with minor version and date)
  // - anthropic.claude-{sonnet|haiku|opus}-4-6-v1:0
  // - anthropic.claude-{sonnet|haiku|opus}-4-20250514-v1:0
  // - anthropic.claude-{sonnet|haiku|opus}-4-5-20250929-v1:0
  
  const modelTypes = ['sonnet', 'haiku', 'opus']
  const models = {}

  for (const modelType of modelTypes) {
    // Match both formats: with date (claude-opus-4-5-20250929) and without date (claude-opus-4-6)
    const anthropicPattern = new RegExp(`claude-${modelType}-\\d+(?:-\\d+)?(?:-\\d{8})?`, 'g')
    const bedrockPattern = new RegExp(`anthropic\\.claude-${modelType}-\\d+(?:-\\d+)?(?:-\\d{8})?-v1:0`, 'g')
    
    const anthropicMatch = html.match(anthropicPattern)
    const bedrockMatch = html.match(bedrockPattern)

    if (anthropicMatch && bedrockMatch) {
      // Get the most recent model (first occurrence, as docs list newest first)
      models[modelType] = {
        anthropic: anthropicMatch[0],
        // Bedrock models should use global inference profiles: global.anthropic.claude-...
        bedrock: `global.${bedrockMatch[0]}`
      }
    } else {
      console.warn(`Warning: Could not find ${modelType} model identifiers in the documentation`)
    }
  }

  if (Object.keys(models).length === 0) {
    throw new Error('Could not find any Claude model identifiers in the documentation')
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
    console.log('Fetching latest Anthropic model identifiers...')
    const models = await fetchLatestModels()

    // Display found models
    for (const [modelType, modelIds] of Object.entries(models)) {
      console.log(`Latest ${modelType} models:`)
      console.log(`  Anthropic API: ${modelIds.anthropic}`)
      console.log(`  Bedrock: ${modelIds.bedrock}`)
    }

    let hasChanges = false

    // Determine which model to use as default (prefer order: opus, sonnet, haiku)
    const defaultModel = models.opus || models.sonnet || models.haiku
    if (!defaultModel) {
      throw new Error('No models found to set as default')
    }

    // Update action.cjs
    console.log('\nUpdating action.cjs...')
    const actionUpdated = await updateFile(
      join(rootDir, 'action.cjs'),
      [
        {
          search: /anthropic_models: 'claude-(?:sonnet|haiku|opus)-\d+(?:-\d+)?(?:-\d{8})?'/,
          replace: `anthropic_models: '${defaultModel.anthropic}'`
        },
        {
          search: /bedrock_models: 'global\.anthropic\.claude-(?:sonnet|haiku|opus)-\d+(?:-\d+)?(?:-\d{8})?-v1:0'/,
          replace: `bedrock_models: '${defaultModel.bedrock}'`
        }
      ]
    )
    if (actionUpdated) {
      console.log('✓ Updated action.cjs')
      hasChanges = true
    } else {
      console.log('- No changes needed in action.cjs')
    }

    // Update anthropicExplainPatch.js
    console.log('\nUpdating anthropicExplainPatch.js...')
    const anthropicUpdated = await updateFile(
      join(rootDir, 'src/anthropicExplainPatch.js'),
      [
        {
          search: /models = \['claude-(?:sonnet|haiku|opus)-\d+(?:-\d+)?(?:-\d{8})?'\]/,
          replace: `models = ['${defaultModel.anthropic}']`
        }
      ]
    )
    if (anthropicUpdated) {
      console.log('✓ Updated anthropicExplainPatch.js')
      hasChanges = true
    } else {
      console.log('- No changes needed in anthropicExplainPatch.js')
    }

    // Update bedrockExplainPatch.js
    console.log('\nUpdating bedrockExplainPatch.js...')

    // First, check if we need to add models to COUNT_TOKENS_HASHFUN
    const bedrockContent = await readFile(join(rootDir, 'src/bedrockExplainPatch.js'), 'utf-8')
    
    const bedrockUpdates = [
      {
        search: /models = \['(?:global\.)?anthropic\.claude-(?:3-7-sonnet-\d{8}|(?:sonnet|haiku|opus)-\d+(?:-\d+)?(?:-\d{8})?)-v1:0'\]/,
        replace: `models = ['${defaultModel.bedrock}']`
      }
    ]

    // Add COUNT_TOKENS_HASHFUN entries for any models not already present
    for (const [modelType, modelIds] of Object.entries(models)) {
      if (!bedrockContent.includes(`'${modelIds.bedrock}': anthropicCountTokens`)) {
        // Find the last anthropic model entry and add after it
        bedrockUpdates.push({
          search: /('(?:global\.)?anthropic\.claude-(?:sonnet|haiku|opus)-\d+(?:-\d+)?(?:-\d{8})?-v1:0': anthropicCountTokens,)\n/,
          replace: `$1\n  '${modelIds.bedrock}': anthropicCountTokens,\n`
        })
      }
    }

    const bedrockUpdated = await updateFile(
      join(rootDir, 'src/bedrockExplainPatch.js'),
      bedrockUpdates
    )
    if (bedrockUpdated) {
      console.log('✓ Updated bedrockExplainPatch.js')
      if (bedrockUpdates.length > 1) {
        console.log(`  - Added ${bedrockUpdates.length - 1} model(s) to COUNT_TOKENS_HASHFUN`)
      }
      hasChanges = true
    } else {
      console.log('- No changes needed in bedrockExplainPatch.js')
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
