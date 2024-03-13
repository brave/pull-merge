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

    patchBody = pBody
  }

  return {
    repo,
    owner,
    type: 'simple',
    body: patchBody,
    watermark: `[[puLL-Merge](https://github.com/brave/pull-merge)] - [${owner}/${repo}@${prnum}](https://github.com/${owner}/${repo}/pull/${prnum})`
  }
}
