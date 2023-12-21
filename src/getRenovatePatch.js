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
    versions = versions.split(/[^0-9\.]/).filter(Boolean).map(x => `v${x}`).join("..");

    if (debug) {
        console.log(`sixthLine: ${sixthLine}`);
        console.log(`link: ${link}, versions: ${versions}`);
    }

    const patchResponse = await fetch(`${link}/compare/${versions}.diff`);

    if (patchResponse.status != 200)
        throw new Error(`Could not fetch PR diff: ${patchResponse.status} ${patchResponse.statusText}`);

    return patchResponse.text();
}