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
      const cloneUrl = `git@github.com:${owner}/${repo}.git`
      const clonePath = path.join(os.tmpdir(), `pr-${prnum}`)

      console.log(`Cloning ${cloneUrl} to ${clonePath}, manually`)
      execSync(`git clone ${cloneUrl} ${clonePath}`)

      // save current directory
      const currentDir = process.cwd()

      // change dir to the new created repo
      process.chdir(clonePath)

      // fetch branch associated with the PR
      const targetBranch = prResponse.base.ref
      const sourceBranch = prResponse.head.ref
      execSync(`git fetch origin ${targetBranch}`)
      execSync(`git fetch origin ${sourceBranch}`)

      // generate the PR diff
      execSync(`git diff origin/${sourceBranch} origin/${targetBranch} > pr.diff`)

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
