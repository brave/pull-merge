export default async function getProperties ({ owner, repo, github, githubToken, debug = false, prefix = '' }) {
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

    const output = {}

    // copy properties not starting with prefix to output
    properties.data.forEach(c => {
      if (!c.property_name.startsWith(prefix)) {
        output[c.property_name] = c.value
      }
    })

    // copy properties starting with prefix to output
    if (prefix) {
      properties.data.forEach(c => {
        if (c.property_name.startsWith(prefix)) {
          const name = c.property_name.substring(prefix.length)
          output[name] = c.value
        }
      })
    }

    return output
  } catch (err) {
    console.log(err)
    return {}
  }
}
