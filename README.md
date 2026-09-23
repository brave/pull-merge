# ![pull-merge](/logo/svg/logo-no-background.svg)

puLL-Merge is a `github-action` to add LLM capabilities to pull-requests in `github`

## Usage

Add an action under `.github/workflow/security-action.yml` with the following content:

```yaml
name: puLL-Merge
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [main]

jobs:
  pull-merge:
    name: security
    runs-on: ubuntu-latest
    steps:
      - uses: brave/pull-merge@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}

```

## Extra diff for submodule bumps (`extra_diff_*`)

A PR that only bumps a submodule carries just a gitlink hunk
(`Subproject commit <old> → <new>`), so the LLM sees nothing about the actual
upstream changes. Pass `extra_diff_repository` to have the action fetch the
real content before filtering:

```yaml
- uses: brave/pull-merge@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    extra_diff_repository: https://github.com/gorhill/uBlock
```

How it works:

- The action clones the repository (`--bare --filter=blob:none`) into a
  scratch dir and computes `git diff <prev>..<head>` — no checkout of the
  PR repository or the fetched repository is needed.
- `extra_diff_head` / `extra_diff_prev` override the pins. By default both
  are parsed from the gitlink hunk of the PR diff, so a plain submodule-bump
  PR needs only the URL.
- If the prev pin is missing from the fetched repository (e.g. a fork-only
  commit right after a submodule repoint), the diff falls back to the empty
  tree so the whole watched content gets reviewed once.
- If the prev pin is fetchable but is not part of the head pin's history
  (e.g. the old pin still points at a fork), the diff starts at
  `git merge-base prev head` so only changes made on the fetched
  repository's side are reviewed — the fork's own commits are not reversed.
- The fetched diff is appended to the PR diff **before** `filterdiff`, so the
  repository's `filterdiff_args` scope applies to the appended content as
  well.
- The inputs are plain values only — the action never runs caller-provided
  commands — and are only honored from action inputs, never from the
  repository's `.github/pull-merge.json` or repo properties.
- A failed clone/fetch aborts the review (no comment is posted), which
  surfaces in the workflow failure.

## Testing LLM integrations (local)

### OpenAI

```bash
$ ./run.js ./src/openaiExplainPatch.js --apiKey=<OPENAI_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```

### Claude

```bash
$ ./run.js ./src/anthropicExplainPatch.js --apiKey=<ANTHROPIC_API_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```
