import { execSync } from 'child_process'

// Runs a caller-provided shell command and returns its stdout as an extra
// diff to append to the PR patch. Useful for content a PR diff cannot
// carry, e.g. submodule bumps (the PR diff only contains the gitlink
// hunk). The caller is responsible for having checked out the repository
// in GITHUB_WORKSPACE before invoking the action.
//
// The command is only ever read from the action inputs — never from the
// repository's pull-merge.json or repo properties — so a repository
// config cannot smuggle command execution into a workflow run it does
// not control.
export default function getExtraDiff ({ inputs, debug = false }) {
  const command = inputs && inputs.extra_diff_command
  if (!command) return null

  if (debug) { console.log('Fetching extra diff via extra_diff_command') }

  const stdout = execSync(command, {
    encoding: 'utf8',
    shell: '/bin/bash',
    cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
    env: process.env
  })

  if (!stdout || !stdout.trim()) {
    if (debug) { console.log('extra_diff_command produced no output') }
    return null
  }

  return stdout
}
