import { markdownToTxt } from 'markdown-to-txt';

export default async function getRenovatePatch({ owner, repo, prnum,
    githubToken = null,
    github = null,
    debug = false
}) {
    if (!github && githubToken) {
        const { Octokit } = await import("@octokit/core");

        github = new Octokit({ auth: githubToken })
    }

    if (debug)
        console.log(`getRenovatePatch ${owner} ${repo} ${prnum}`);

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

    const sixthLine = result.repository.pullRequest.body.split("\n")[6].split(/\|/).filter(Boolean).map(x => x.trim());
    let [link, versions] = sixthLine;

    if (versions == "action") {
        versions = sixthLine[3];
    }

    versions = markdownToTxt(versions);

    link = link.replace(/^.*https:\/\/to/, 'https://').replace(/\).*$/, '').replace(/\/releases$/, '');

    // get last two elements of an array
    const [tOrg, tRepo] = link.split('/').filter(Boolean).slice(-2);
    const [from, to] = versions.split(/[^0-9\.]/).filter(Boolean);

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

    if (debug) {
        console.log(`sixthLine: ${sixthLine}`);
        console.log(`link: ${link}, versions: ${versions}`);
    }

    const patchResponse = await fetch(`${link}/compare/${fromFiltered}..${toFiltered}.diff`);

    if (patchResponse.status != 200)
        throw new Error(`Could not fetch PR diff: ${patchResponse.status} ${patchResponse.statusText}`);

    return {
        repo: tRepo,
        owner: tOrg,
        type: "renovate",
        body: await patchResponse.text(),
        watermark: `[[puLL-Merge](https://github.com/brave/pull-merge)] - [${tOrg}/${tRepo}@${fromFiltered}..${toFiltered}](${link}/compare/${fromFiltered}..${toFiltered}.diff)`
    };
}