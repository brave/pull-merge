import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

export default async function getPatch ({
  owner, repo, prnum,
  githubToken = null,
  github = null,
  runIfPrivate = false,
  debug = false
}) {
  if (!github && githubToken) {
    const { Octokit } = await import('@octokit/core')

    github = new Octokit({ auth: githubToken })
  }

  if (!githubToken) {
    githubToken = process.env.GITHUB_TOKEN
  }

  if (debug) { console.log(`getPatch ${owner} ${repo} ${prnum}`) }

  let patchBody = null

  if (!github && !githubToken) {
    const patchResponse = await fetch(`https://github.com/${owner}/${repo}/pull/${prnum}.diff`)

    if (patchResponse.status !== 200) {
      throw new Error(`Could not fetch PR diff: ${patchResponse.status} ${patchResponse.statusText}`)
    }

    patchBody = await patchResponse.text()
  } else {
    try {
      const { data: pBody } = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: prnum,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        },
        mediaType: {
          format: 'diff'
        }
      })

      patchBody = pBody
    } catch (err) {
      console.log(err)

      const { data: prResponse } = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: prnum,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        },
        mediaType: {
          format: 'json'
        }
      })

      // clone the repo
      const clonePath = path.join(os.tmpdir(), `pr-${prnum}`)

      execSync(`gh repo clone ${owner}/${repo} ${clonePath}`, { env: process.env })

      // save current directory
      const currentDir = process.cwd()

      // change dir to the new created repo
      process.chdir(clonePath)

      // generate the PR diff using commit SHAs from the PR
      const baseSha = prResponse.base.sha
      const headSha = prResponse.head.sha

      // diff between base and head commits
      execSync(`git diff ${baseSha} ${headSha} > pr.diff`)

      patchBody = await fs.readFile(path.join(clonePath, 'pr.diff'), 'utf8')

      // get back to previous directory and delete the cloned repo
      process.chdir(currentDir)
      await fs.rm(clonePath, { recursive: true })
    }

    const { data: repoResponse } = await github.request('GET /repos/{owner}/{repo}', {
      owner,
      repo,
      pull_number: prnum,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (!runIfPrivate && (repoResponse.private || repoResponse.visibility === 'private')) {
      throw new Error('This repo is private, and you have not enabled runIfPrivate')
    }
  }

  return {
    repo,
    owner,
    type: 'simple',
    body: patchBody,
    watermark: `[[puLL-Merge](https://github.com/brave/pull-merge)] - [${owner}/${repo}@${prnum}](https://github.com/${owner}/${repo}/pull/${prnum})`
  }
}
