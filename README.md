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
$ ./run.js ./src/openaiExplainPatch.js --apiKey=<OPENAI_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```

### Claude

```bash
$ ./run.js ./src/anthropicExplainPatch.js --apiKey=<ANTHROPIC_API_KEY> --owner=<GITHUB_OWNER e.g. brave> --repo=<REPO> --patchBody=<PATCHBODY> --debug=true
```
