/**
 * Container entry point for the puLL-Merge action.
 *
 * action.cjs used to run through actions/github-script, which only
 * executes on the runner host — inside the job container the main script
 * never ran. run.cjs is a `run:` step: it executes inside the container
 * and rebuilds the github-script surface (github/context) from the
 * standard runner environment via src/shim.js.
 *
 * Inputs arrive via the INPUTS_JSON environment variable (action.yml
 * sets INPUTS_JSON: ${{ toJson(inputs) }}); stdin JSON is accepted as a
 * fallback for local runs and tests. Env values are never rendered into
 * the script body nor echoed, so an input containing shell
 * metacharacters can never execute there, and tokens stay out of the
 * logs. The GITHUB_TOKEN env the action.yml step exports authenticates
 * the shim's Octokit; the input token (when present) wins, matching
 * github-script, and is bridged into the environment.
 */

const fs = require('fs')
const path = require('path')

const actionPath = process.env.ACTION_PATH || __dirname

function readInputs () {
  const fromEnv = process.env.INPUTS_JSON
  if (fromEnv !== undefined) {
    try {
      return JSON.parse(fromEnv)
    } catch (err) {
      throw new Error(`INPUTS_JSON is not valid JSON: ${err.message}`)
    }
  }
  // Fallback (tests, manual runs): JSON on stdin. Empty or unparsable
  // stdin is a hard failure — running with silently-empty inputs would
  // act with no token and no config.
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf-8').trim()
  } catch (err) {
    throw new Error(`failed to read inputs from stdin: ${err.message}`)
  }
  if (!raw) {
    throw new Error('no inputs: set INPUTS_JSON or pipe the inputs JSON on stdin')
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`stdin is not valid JSON: ${err.message}`)
  }
}

async function main () {
  const inputs = readInputs()

  if (inputs.github_token) {
    process.env.GITHUB_TOKEN = inputs.github_token
  }

  const { buildGithubScriptShim } = await import(path.join(actionPath, 'src', 'shim.js'))
  const { github, context } = await buildGithubScriptShim({ actionPath })
  const script = require(path.join(actionPath, 'action.cjs'))
  await script({ github, context, inputs, actionPath })
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
