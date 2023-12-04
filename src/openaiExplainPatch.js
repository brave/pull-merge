import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";
import { spawn } from "child_process";

async function filterdiff({ content }) {
    const cp = spawn('filterdiff', ['--strip=1', '--exclude=**/package-lock.json']);
    const output = [];
    const error = [];

    cp.stdin.write(content);

    cp.stdout.on('data', (data) => output.push(data));
    cp.stderr.on('data', (data) => error.push(data));
    cp.stdin.end();

    await new Promise((resolve) => cp.on('close', resolve));

    if (error.length > 0)
        throw new Error(error.join());

    return output.join();
}

export default async function explainPatch({openaiKey, owner, repo, prnum,
  githubToken = null,
  github=null,
  model = "gpt-4-1106-preview",
  system_prompt = `
You are an expert software engineer reviewing a pull request on Github. Lines that start with "+" have been added, lines that start with "-" have been deleted. Use markdown for formatting your review.

Desired format:
### Description
<description_of_PR> // How does this PR change the codebase? What is the motivation for this change?
### Changes
<list_of_changes> // Describe the main changes in the PR, organizing them by filename
### Security Hotspots
<list_of_security_hotspots> // Describe locations for possible vulnerabilities in the change, order by risk
\n`,
  max_tokens=2048,
  temperature=1,
  top_p=1,
  frequency_penalty=0,
  presence_penalty=0,
  amplification=4,
  debug=false}) {
  const enc = encoding_for_model(model);
  const openai = new OpenAI({apiKey: openaiKey});

  if (!github && githubToken) {
    const { Octokit } = await import("@octokit/core");

    github = new Octokit({auth: githubToken})
  }

  var patchBody = null;

  if (!github && !githubToken) {
    const patchResponse = await fetch(`https://github.com/${owner}/${repo}/pull/${prnum}.diff`);
    patchBody = await patchResponse.text();
  } else {
    const {data: pBody} = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: owner,
      repo: repo,
      pull_number: prnum,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      },
      mediaType: {
        format: "diff",
      },
    })
    patchBody = pBody;
  }

  var patchBody = await filterdiff({content: patchBody});

  if (debug) {
    return "debug\n\n```\n"+patchBody+"\n```";
  }

  if (enc.encode(patchBody).length < amplification*max_tokens)
    throw new Error("The patch is trivial, no need for a summarization");

  const user_prompt = `This is the PR diff\n\`\`\`\n${patchBody}\n\`\`\``;

  if (debug) {
    console.log(user_prompt)
  }  

  const aiResponse = await openai.chat.completions.create({
    model: model,
    messages: [
          {
            "role": "system",
            "content": system_prompt,
          },
          {
            "role": "user",
            "content": user_prompt
          }
    ],
    temperature: temperature,
    max_tokens: max_tokens,
    top_p: top_p,
    frequency_penalty: frequency_penalty,
    presence_penalty: presence_penalty,
  });

  if (debug) {
    console.log(aiResponse);
    console.log(aiResponse.choices[0].message);
  }

  return aiResponse.choices[0].message.content;
}
