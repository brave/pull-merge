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
 * @actions/core-compatible logger. setOutput prefers the runner's
 * GITHUB_OUTPUT file and falls back to the ::set-output:: workflow
 * command (github-script behavior on older runners); setSecret emits
 * ::add-mask::, which the runner picks up from stdout.
 */
function buildCore (env, fsx, log = console.log) {
  return {
    info: (msg) => log(`[info] ${msg}`),
    debug: (msg) => log(`[debug] ${msg}`),
    warning: (msg) => log(`[warning] ${msg}`),
    error: (msg) => log(`[error] ${msg}`),
    notice: (msg) => log(`[notice] ${msg}`),
    setFailed: (msg) => {
      log(`[error] ${msg}`)
      process.exitCode = 1
    },
    setOutput: (name, value) => {
      const out = env.GITHUB_OUTPUT
      if (out) {
        fsx.appendFileSync(out, `${name}=${value}\n`)
      } else {
        log(`::set-output name=${name}::${value}`)
      }
    },
    setSecret: (value) => log(`::add-mask::${value}`),
    exportVariable: (name, value) => {
      const envFile = env.GITHUB_ENV
      if (envFile) fsx.appendFileSync(envFile, `${name}=${value}\n`)
      else process.env[name] = value
    }
  }
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
