export default async function getConfig ({ owner, repo, path, github, githubToken, debug = false }) {
  if (!github && githubToken) {
    const { Octokit } = await import('@octokit/core')

    github = new Octokit({ auth: githubToken })
  }

  try {
    const { data } = await github.rest.repos.getContent({
      owner,
      repo,
      path
    })
    const fileContent = Buffer.from(data.content, 'base64').toString('utf8')
    if (debug) console.log(fileContent)
    return JSON.parse(fileContent)
  } catch (err) {
    if (debug) console.log(err)
    return {}
  }
}
