/**
 * Container entry point for the puLL-Merge action.
 *
 * action.cjs used to run through actions/github-script, which only
 * executes on the runner host — inside the job container the main script
 * never ran. run.cjs is a `run:` step: it executes inside the container
 * and rebuilds the github-script surface (github/context) from the
 * standard runner environment via src/shim.js.
 *
 * Inputs arrive on stdin as JSON (a quoted heredoc in action.yml), the
 * same object ${{ toJson(inputs) }} passed to github-script. The
 * GITHUB_TOKEN flows through the GITHUB_TOKEN env the action.yml step
 * sets; when absent it is bridged from the inputs.
 */

const fs = require('fs')
const path = require('path')

const actionPath = process.env.ACTION_PATH || __dirname

let inputs = {}
try {
  const raw = fs.readFileSync(0, 'utf-8')
  if (raw.trim()) inputs = JSON.parse(raw)
} catch (err) {
  if (process.env.DEBUG === 'true') console.log(`no stdin inputs: ${err.message}`)
}

if (inputs.github_token && !process.env.GITHUB_TOKEN) {
  process.env.GITHUB_TOKEN = inputs.github_token
}

async function main () {
  const { buildGithubScriptShim } = await import(path.join(actionPath, 'src', 'shim.js'))
  const { github, context } = await buildGithubScriptShim({ actionPath })
  const script = require(path.join(actionPath, 'action.cjs'))
  await script({ github, context, inputs, actionPath })
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
