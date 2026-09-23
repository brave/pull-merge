import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// Parses the gitlink hunk of a PR diff ("Subproject commit <old>" removed
// line followed by "Subproject commit <new>" added line).
export function parseGitlinkPins (patchBody) {
  const shas = [...patchBody.matchAll(/^[+-]Subproject commit ([0-9a-f]{40})$/gm)].map((m) => m[1])
  if (shas.length < 2) return null
  return { prev: shas[0], head: shas[1] }
}

function git (args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    throw new Error(`git ${args.join(' ')} failed: ${err.message}`)
  }
}

// Fetches a repository (extra_diff_repository) and returns the diff between
// two pins (prev..head) to append to the PR patch — e.g. the real upstream
// changes behind a submodule gitlink bump, which a PR diff cannot carry.
// Pins default to the gitlink hunk of the PR diff when not passed
// explicitly. If the prev pin is missing from the fetched repository (e.g.
// a fork-only commit), the diff falls back to the empty tree. If the prev
// pin exists but is not part of the head pin's history (e.g. a pin carried
// over from a fork), the diff starts at the merge base of the two pins so
// only changes actually on the target repository's side are reviewed.
// All inputs are plain values: this module never runs caller-provided
// commands.
export default function getExtraDiff ({ inputs, patch, debug = false }) {
  const url = inputs && inputs.extra_diff_repository
  if (!url) return null

  const pins = parseGitlinkPins(patch.body) ?? {}
  const prev = (inputs && inputs.extra_diff_prev) || pins.prev
  const head = (inputs && inputs.extra_diff_head) || pins.head
  if (!prev || !head) {
    throw new Error('extra_diff_repository is set but no pins were found: pass extra_diff_prev/extra_diff_head, or make the PR diff contain a gitlink hunk')
  }

  if (debug) { console.log(`Fetching extra diff ${prev}..${head} from ${url}`) }

  const workDir = mkdtempSync(path.join(tmpdir(), 'pm-extra-diff-'))
  const dir = path.join(workDir, 'repo.git')
  try {
    git(['clone', '--bare', '--filter=blob:none', url, dir])
    git(['-C', dir, 'fetch', 'origin', head])
    try {
      git(['-C', dir, 'fetch', 'origin', prev])
    } catch (err) {
      if (debug) { console.log(`Could not fetch prev pin ${prev}: ${err.message}`) }
    }

    let base = prev
    let found = true
    try {
      execFileSync('git', ['-C', dir, 'cat-file', '-e', `${base}^{commit}`])
    } catch (err) {
      found = false
    }
    if (!found) {
      console.log(`Prev pin ${prev} not found on ${url}; diffing against the empty tree.`)
      base = EMPTY_TREE
    } else {
      let ancestor = true
      try {
        execFileSync('git', ['-C', dir, 'merge-base', '--is-ancestor', prev, head])
      } catch (err) {
        ancestor = false
      }
      if (!ancestor) {
        // prev is not on head's history (e.g. a pin carried over from a
        // fork): diff the changes made on the repository's side since the
        // merge base instead of also reversing the fork's own commits.
        base = git(['-C', dir, 'merge-base', prev, head]).trim() || EMPTY_TREE
        console.log(`Prev pin ${prev} is not on ${url} history; diffing from merge base ${base}.`)
      }
    }

    return git(['-C', dir, 'diff', `${base}..${head}`])
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
