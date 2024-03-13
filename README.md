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

## Testing LLM integrations (local)

### OpenAI

```bash
$ ./run.js ./src/openaiExplainPatch.js --githubKey=<GITHUB_KEY> --openaiKey=<OPENAI_KEY> --owner=brave --repo=security-action --prnum=406
```

### Claude

Make sure your Claude API key is set as `ANTHROPIC_API_KEY` in your
environment, then run:

```bash
$ ./run.js ./src/claudeExplainPatch.js --githubKey=<GITHUB_KEY> --owner=brave --repo=security-action --prnum=406
```
