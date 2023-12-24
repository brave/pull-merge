export default async function getDependabotPatch({ owner, repo, prnum,
    githubToken = null,
    github = null,
    debug = false
}) {
    if (!github && githubToken) {
        const { Octokit } = await import("@octokit/core");

        github = new Octokit({ auth: githubToken })
    }

    if (debug)
        console.log(`getDependabotPatch ${owner} ${repo} ${prnum}`);

    if (!github && !githubToken) {
        throw new Error("You must provide a githubToken to use this function");
    }

    prnum = parseInt(prnum, 10);

    // get PR description
    const prbodyQuery = `query PRBody($owner:String!, $name:String!, $number:Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number:$number) {
            body
          }
        }
    }`;
    const prbodyVariables = {
        owner,
        name: repo,
        number: prnum
    };
    const result = await github.graphql(prbodyQuery, prbodyVariables);

    // https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff

    const firstline = result.repository.pullRequest.body.split("\n")[0];
    const match = /^Bumps \[[^\]]*\]\(([^\)]*)\) from ([0-9\.]*) to ([0-9\.]*)\./.exec(firstline);

    if (match) {
        const [, link, from, to] = match;

        // get last two elements of an array
        const [tOrg, tRepo] = link.split('/').filter(Boolean).slice(-2);

        if (debug)
            console.log(`link: ${link}, from: ${from}, to: ${to}, org: ${tOrg}, repo: ${tRepo}`);

        // list matching references
        const tagsQuery = `query Tags($owner:String!, $name:String!) {
            repository(owner: $owner, name: $name) {
                refs(refPrefix: "refs/tags/", last: 100) {
                    nodes {
                        name
                    }
                }
            }
        }`;
        const tagsVariables = {
            owner: tOrg,
            name: tRepo,
        };

        const tags = (await github.graphql(tagsQuery, tagsVariables)).repository.refs.nodes.map(x => x.name);

        if (debug)
            console.log(tags);

        const fromFiltered = tags.filter(x => x.endsWith(from))[0];
        const toFiltered = tags.filter(x => x.endsWith(to))[0];
        
        const patchLink = `https://github.com/${tOrg}/${tRepo}/compare/${fromFiltered}..${toFiltered}.diff`;

        const patchResponse = await fetch(patchLink);

        if (patchResponse.status != 200)
            throw new Error(`Could not fetch PR diff: ${patchResponse.status} ${patchResponse.statusText}`);

        return {
            repo: tRepo,
            owner: tOrg,
            type: "dependabot",
            body: await patchResponse.text(),
            watermark: `[[puLL-Merge](https://github.com/brave/pull-merge)] - [${tOrg}/${tRepo}@${fromFiltered}..${toFiltered}](${patchLink})`
        };
    }
}