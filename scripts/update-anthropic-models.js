import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

async function fetchLatestModels () {
  const response = await fetch('https://docs.claude.com/en/docs/about-claude/models/overview')
  const html = await response.text()

  // Extract the latest Sonnet model identifiers from the HTML
  // Looking for patterns like:
  // - claude-sonnet-4-20250514 (single version)
  // - claude-sonnet-4-5-20250929 (with minor version)
  // - anthropic.claude-sonnet-4-20250514-v1:0
  // - anthropic.claude-sonnet-4-5-20250929-v1:0
  const anthropicMatch = html.match(/claude-sonnet-\d+(?:-\d+)?-\d{8}/g)
  const bedrockMatch = html.match(/anthropic\.claude-sonnet-\d+(?:-\d+)?-\d{8}-v1:0/g)

  if (!anthropicMatch || !bedrockMatch) {
    throw new Error('Could not find Sonnet model identifiers in the documentation')
  }

  // Get the most recent model (first occurrence, as docs list newest first)
  const latestAnthropicModel = anthropicMatch[0]
  // Bedrock models should use global inference profiles: global.anthropic.claude-...
  const latestBedrockModel = `global.${bedrockMatch[0]}`

  return {
    anthropic: latestAnthropicModel,
    bedrock: latestBedrockModel
  }
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
    console.log('Fetching latest Anthropic Sonnet model identifiers...')
    const models = await fetchLatestModels()

    console.log(`Latest Anthropic Sonnet model: ${models.anthropic}`)
    console.log(`Latest Bedrock Sonnet model: ${models.bedrock}`)

    let hasChanges = false

    // Update action.cjs
    console.log('\nUpdating action.cjs...')
    const actionUpdated = await updateFile(
      join(rootDir, 'action.cjs'),
      [
        {
          search: /anthropic_models: 'claude-sonnet-\d+(?:-\d+)?-\d{8}'/,
          replace: `anthropic_models: '${models.anthropic}'`
        },
        {
          search: /bedrock_models: 'global\.anthropic\.claude-sonnet-\d+(?:-\d+)?-\d{8}-v1:0'/,
          replace: `bedrock_models: '${models.bedrock}'`
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
          search: /models = \['claude-sonnet-\d+(?:-\d+)?-\d{8}'\]/,
          replace: `models = ['${models.anthropic}']`
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

    // First, check if we need to add the model to COUNT_TOKENS_HASHFUN
    const bedrockContent = await readFile(join(rootDir, 'src/bedrockExplainPatch.js'), 'utf-8')
    const needsCountTokensEntry = !bedrockContent.includes(`'${models.bedrock}': anthropicCountTokens`)

    const bedrockUpdates = [
      {
        search: /models = \['global\.anthropic\.claude-(?:3-7-sonnet-\d{8}|sonnet-\d+(?:-\d+)?-\d{8})-v1:0'\]/,
        replace: `models = ['${models.bedrock}']`
      }
    ]

    // Add COUNT_TOKENS_HASHFUN entry if needed
    if (needsCountTokensEntry) {
      bedrockUpdates.push({
        search: /('global\.anthropic\.claude-sonnet-\d+(?:-\d+)?-\d{8}-v1:0': anthropicCountTokens,)\n/,
        replace: `$1\n  '${models.bedrock}': anthropicCountTokens,\n`
      })
    }

    const bedrockUpdated = await updateFile(
      join(rootDir, 'src/bedrockExplainPatch.js'),
      bedrockUpdates
    )
    if (bedrockUpdated) {
      console.log('✓ Updated bedrockExplainPatch.js')
      if (needsCountTokensEntry) {
        console.log('  - Added model to COUNT_TOKENS_HASHFUN')
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
