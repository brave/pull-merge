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

## Extra diff for submodule bumps (`extra_diff_command`)

A PR that only bumps a submodule carries just a gitlink hunk
(`Subproject commit <old> → <new>`), so the LLM sees nothing about the actual
upstream changes. Pass `extra_diff_command` to have the action fetch the real
content before filtering:

```yaml
jobs:
  pull-merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7 # with: fetch-depth: 0
      - run: git submodule update --init
      - uses: brave/pull-merge@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          extra_diff_command: |
            old=$(git rev-parse "origin/master:submodules/uBlock")
            new=$(git rev-parse "HEAD:submodules/uBlock")
            cd submodules/uBlock
            git fetch -q origin "$old" || true
            if git cat-file -e "${old}^{commit}" 2>/dev/null; then range="$old..$new"; else range="$(git hash-object -t tree /dev/null)..$new"; fi
            git diff $range
```

Notes:

- The command runs with `/bin/bash` in `GITHUB_WORKSPACE`; its stdout (a git
  diff) is appended to the PR diff **before** `filterdiff`, so the repository's
  `filterdiff_args` scope applies to the appended content as well.
- The command is only honored when passed as an **action input** — values from
  the repository's `.github/pull-merge.json` or repo properties are ignored,
  so a PR cannot inject command execution.
- A failing command aborts the review (no comment is posted), which surfaces
  in the workflow failure.

## Testing LLM integrations (local)

### OpenAI

```bash
$ ./run.js ./src/openaiExplainPatch.js --apiKey=<OPENAI_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```

### Claude

```bash
$ ./run.js ./src/anthropicExplainPatch.js --apiKey=<ANTHROPIC_API_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```
