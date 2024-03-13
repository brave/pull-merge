export default async function getProperties ({ owner, repo, github, githubToken, debug = false }) {
  if (!github && githubToken) {
    const { Octokit } = await import('@octokit/core')

    github = new Octokit({ auth: githubToken })
  }

  try {
    const properties = await github.request('GET /repos/{owner}/{repo}/properties/values', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    if (debug) console.log(properties)
    return properties.data.reduce((acc, cur) => {
      acc[cur.property_name] = cur.value
      return acc
    }, {})
  } catch (err) {
    console.log(err)
    return {}
  }
}
