import OpenAI from "openai";

export default async function explainPatch({openaiKey, owner, repo, prnum,
  githubToken=null, 
  github=null,
  model="gpt-3.5-turbo-instruct",
  system_prompt="Explain the patch:\n\n",
  max_tokens=2048,
  temperature=1,
  top_p=1,
  frequency_penalty=0,
  presence_penalty=0}) {

  if (!github && !githubToken) throw RangeError("github and githubToken arguments cannot be both null");

  const openai = new OpenAI({apiKey: openaiKey});

  if (!github) {
    const { Octokit } = await import("@octokit/core");
    
    github = new Octokit({auth: githubToken})
  }

  const {data: patchBody} = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: owner,
    repo: repo,
    pull_number: prnum,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    },
    mediaType: {
      format: "patch",
    },
  })

  const aiResponse = await openai.chat.completions.create({
    model: model,
    messages: [
          {
            "role": "system",
            "content": system_prompt,
          },
          {
            "role": "user",
            "content": patchBody
          }
    ],
    temperature: temperature,
    max_tokens: max_tokens,
    top_p: top_p,
    frequency_penalty: frequency_penalty,
    presence_penalty: presence_penalty,
  });

  // console.log(aiResponse);
  // console.log(aiResponse.choices[0].message);

  return aiResponse.choices[0].message.content;
}
