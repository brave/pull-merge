/**
 * github-script surface shim.
 *
 * pull-merge used to execute action.cjs through actions/github-script,
 * which runs on the runner host — the job container never saw the LLM
 * review pipeline. The prebuilt-image path runs action.cjs inside the
 * container instead (run.cjs), so the injected globals github-script
 * provides must be rebuilt from the standard runner environment:
 *
 *   github  → authenticated Octokit built from the action's node_modules
 *   context → repo/event/actor/payload/issue from runner env vars
 *   core    → @actions/core-compatible logger + step-output writer
 *
 * The full github-script instance is an Octokit with the retry, throttle
 * and paginate plugins; the 'octokit' bundle in package.json provides
 * exactly that surface.
 */

import fs from 'fs'
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

function buildContext (env, fsx) {
  const [owner, repo] = String(env.GITHUB_REPOSITORY || '').split('/')
  const payload = readPayload(env, fsx)
  const issueNumber = payload?.issue?.number ?? payload?.pull_request?.number
  return {
    repo: { owner, repo },
    eventName: env.GITHUB_EVENT_NAME,
    actor: env.GITHUB_ACTOR,
    payload,
    issue: { number: issueNumber },
    sha: env.GITHUB_SHA,
    ref: env.GITHUB_REF
  }
}

function readPayload (env, fsx) {
  const eventPath = env.GITHUB_EVENT_PATH
  if (!eventPath) return {}
  try {
    return JSON.parse(fsx.readFileSync(eventPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * @actions/core-compatible logger.
 *
 * warning/error/notice emit the runner annotation commands (::warning::,
 * ::error::, ::notice::) instead of plain text — annotations surface in
 * the GitHub UI like @actions/core does. setOutput/exportVariable use
 * the runner's heredoc-delimiter file format so multiline values survive
 * round-tripping; single-line values keep the plain name=value form.
 */
const GHADELIMITER = 'ghadelimiter_' + crypto.randomUUID()

function appendEnvFile (env, fsx, fileVar, content) {
  const file = env[fileVar]
  if (!file) return false
  fsx.appendFileSync(file, content)
  return true
}

function buildCore (env, fsx, log = console.log) {
  const summary = buildSummary(env, fsx, log)
  return {
    isDebug: () => env.RUNNER_DEBUG === '1' || String(env.DEBUG || '') === 'true',
    info: (msg) => log(String(msg)),
    debug: (msg) => log(`[debug] ${msg}`),
    warning: (msg) => log(`::warning::${msg}`),
    error: (msg) => log(`::error::${msg}`),
    notice: (msg) => log(`::notice::${msg}`),
    setFailed: (msg) => {
      log(`::error::${msg}`)
      process.exitCode = 1
    },
    getInput: (name, options = {}) => {
      const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
      const val = env[key] || ''
      if (options && options.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return val
    },
    startGroup: (name) => log(`::group::${name}`),
    endGroup: () => log('::endgroup::'),
    group: async (name, fn) => {
      log(`::group::${name}`)
      try {
        return await fn()
      } finally {
        log('::endgroup::')
      }
    },
    setOutput: (name, value) => {
      const v = String(value)
      if (v.includes(GHADELIMITER)) {
        throw new Error(`Set output ${name} attempted to use the reserved delimiter ${GHADELIMITER}`)
      }
      // Multiline values need the runner's delimiter format; a bare
      // name=value line would leak every line after the first into the
      // file as bogus keys.
      const rendered = v.includes('\n')
        ? `${name}<<${GHADELIMITER}\n${v}\n${GHADELIMITER}\n`
        : `${name}=${v}\n`
      if (!appendEnvFile(env, fsx, 'GITHUB_OUTPUT', rendered)) {
        log(`::set-output name=${name}::${v}`)
      }
    },
    setSecret: (value) => log(`::add-mask::${value}`),
    exportVariable: (name, value) => {
      const v = String(value)
      const rendered = v.includes('\n')
        ? `${name}<<${GHADELIMITER}\n${v}\n${GHADELIMITER}\n`
        : `${name}=${v}\n`
      if (!appendEnvFile(env, fsx, 'GITHUB_ENV', rendered)) {
        process.env[name] = value
      }
    },
    summary
  }
}

/**
 * Job-summary writer (@actions/core.summary surface). Buffers markdown
 * and writes it to GITHUB_STEP_SUMMARY on write(); falls back to stdout
 * logging when the file is absent (tests, local runs).
 */
function buildSummary (env, fsx, log = console.log) {
  let buffer = ''
  const api = {
    addRaw: (text, opts = {}) => { buffer += text; if (opts.addEOL) buffer += '\n'; return api },
    addEOL: () => { buffer += '\n'; return api },
    addCodeBlock: (code, lang) => { buffer += `\`\`\`${lang || ''}\n${code}\n\`\`\`\n`; return api },
    addHeading: (heading, level) => { buffer += `${'#'.repeat(Math.min(level || 2, 6))} ${heading}\n`; return api },
    addBreak: () => { buffer += '\n<br>\n\n'; return api },
    addLink: (text, href) => { buffer += `[${text}](${href})`; return api },
    addQuote: (quote) => { buffer += `> ${quote}\n`; return api },
    addSeparator: () => { buffer += '\n---\n\n'; return api },
    addList: (items) => { buffer += `${items.map(i => `  - ${i}`).join('\n')}\n`; return api },
    addTable: (rows) => {
      const cells = row => `| ${row.map(c => String(c).replace(/\|/g, '\\|')).join(' | ')} |`
      buffer += rows[0].map(() => ' --- ').reduce((acc, c) => acc + `|${c}`, '') + '|\n'
      buffer += `${rows.map(cells).join('\n')}\n`
      return api
    },
    addDetails: (label, content) => { buffer += `<details><summary>${label}</summary>\n${content}\n</details>\n`; return api },
    write: async () => {
      if (buffer === '') return
      const file = env.GITHUB_STEP_SUMMARY
      if (file) fsx.appendFileSync(file, buffer)
      else log(buffer)
      buffer = ''
    },
    clear: () => { buffer = ''; return api },
    stringify: () => buffer,
    isEmptyBuffer: () => buffer === ''
  }
  return api
}

/**
 * Build the injected surface. `fsx` and `log` are seams for the BDD
 * suites; production uses the real fs and stdout.
 */
export async function buildGithubScriptShim ({
  env = process.env,
  fsx = fs,
  log,
  actionPath,
  OctokitClass
} = {}) {
  const core = buildCore(env, fsx, log)
  const context = buildContext(env, fsx)

  let github
  const octokitOpts = {
    auth: env.GITHUB_TOKEN,
    // plugin-throttling validates the handlers at construction time when
    // enabled — mirror the fallbacks actions/github-script installs.
    throttle: {
      enabled: env.GITHUB_ACTIONS === 'true',
      onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`)
        if (options.request.retryCount === 0) {
          octokit.log.warn(`Retrying after ${retryAfter} seconds!`)
          return true
        }
        return false
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary rate limit triggered for request ${options.method} ${options.url}`)
        return true
      }
    },
    retry: { enabled: true }
  }
  if (OctokitClass) {
    // Test seam: a fake constructor recording its options.
    github = new OctokitClass(octokitOpts)
  } else {
    const actionRequire = createRequire(path.join(actionPath, 'package.json'))
    const { Octokit } = actionRequire('octokit')
    github = new Octokit(octokitOpts)
  }

  return { github, context, core, os, path }
}

export { buildContext, buildCore }
