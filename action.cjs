module.exports = async ({ github, context, inputs, actionPath }) => {
  const { default: filterdiff } = await import(`${actionPath}/src/filterdiff.js`)
  const { default: getConfig } = await import(`${actionPath}/src/getConfig.js`)
  const { default: getProperties } = await import(`${actionPath}/src/getProperties.js`)
  const { SYSTEM_PROMPT } = await import(`${actionPath}/src/utils.js`)

  const raise = (message) => { throw new Error(message) }

  // delete if empty string in inputs value
  Object.keys(inputs).forEach(key => inputs[key] === '' && delete inputs[key])

  let debug = process.env.DEBUG === 'true'
  if (debug) console.log('Initializing puLL-Merge')

  const config = await getConfig({ owner: context.repo.owner, repo: context.repo.repo, path: '.github/pull-merge.json', debug, github })
  const properties = await getProperties({ owner: context.repo.owner, repo: context.repo.repo, debug, github, prefix: 'pull_merge_' })

  const options = Object.assign({
    debounce_time: '6',
    amplification: '4',
    filterdiff_args: '--exclude=**/package-lock.json --exclude=**/yarn.lock --exclude=**/*.js.map --exclude=**/*.svg --exclude=**/test/data/**/* --exclude=**/docs/**/* --exclude=**/deploy/**/* --exclude=**/.htpasswd',
    openai_models: 'gpt-4o-2024-05-13 gpt-3.5-turbo-0125',
    anthropic_models: 'claude-opus-4-5-20251101',
    bedrock_models: 'global.anthropic.claude-opus-4-5-20251101-v1:0',
    owner: context.repo.owner,
    repo: context.repo.repo,
    prnum: context.issue.number,
    max_tokens: '3072',
    subtle_mode: 'false',
    include_diff: 'false',
    system_prompt: SYSTEM_PROMPT
  }, config, properties, inputs)

  // convert to numbers some options
  options.debounce_time = parseFloat(options.debounce_time, 10)
  options.amplification = parseFloat(options.amplification, 10)
  options.prnum = parseFloat(options.prnum, 10)
  options.max_tokens = parseFloat(options.max_tokens, 10)
  options.subtle_mode = options.subtle_mode === 'true'
  options.include_diff = options.include_diff === 'true'

  if (!options.bedrock_aws_iam_role_arn && options.run_if_private) {
    throw new Error('impossible state: should only run on private repositories using bedrock')
  }

  const { default: explainPatch } =
    options.bedrock_aws_iam_role_arn
      ? await import(`${actionPath}/src/bedrockExplainPatch.js`)
      : options.anthropic_api_key
        ? await import(`${actionPath}/src/anthropicExplainPatch.js`)
        : await import(`${actionPath}/src/openaiExplainPatch.js`)

  const { default: submitReview } = options.subtle_mode
    ? await import(`${actionPath}/src/subtleSubmitReview.js`)
    : await import(`${actionPath}/src/submitReview.js`)

  try {
    const { default: getPatch } = (context.payload.pull_request && context.payload.pull_request.user.login === 'renovate[bot]') || context.actor === 'renovate[bot]'
      ? options.subtle_mode ? raise('subtle_mode enabled, this is not supported for renovate') : await import(`${actionPath}/src/getRenovatePatch.js`)
      : (context.payload.pull_request && context.payload.pull_request.user.login === 'dependabot[bot]') || context.actor === 'dependabot[bot]'
          ? options.subtle_mode ? raise('subtle_mode enabled, this is not supported for dependabot') : await import(`${actionPath}/src/getDependabotPatch.js`)
          : await import(`${actionPath}/src/getPatch.js`)

    options.key = options.anthropic_api_key || options.openai_api_key
    options.models = options.bedrock_aws_iam_role_arn
      ? options.bedrock_models
      : options.anthropic_api_key
        ? options.anthropic_models
        : options.openai_models

    debug = options.debug ? (options.debug === 'true') : debug

    if (debug) {
      console.log(`Using options: ${JSON.stringify(options)}`)
      console.log(`Using config: ${JSON.stringify(config)}`)
      console.log(`Using properties: ${JSON.stringify(properties)}`)
      console.log(`Using inputs: ${JSON.stringify(inputs)}`)
    }

    const patch = await getPatch({
      owner: options.owner,
      repo: options.repo,
      prnum: options.prnum,
      debug,
      runIfPrivate: options.run_if_private,
      github
    })

    const filteredPatch = await filterdiff({
      content: patch.body,
      args: options.filterdiff_args,
      debug
    })

    const explainPatchCb = async () => await explainPatch({
      apiKey: options.key,
      patchBody: filteredPatch,
      owner: patch.owner,
      repo: patch.repo,
      debug,
      models: options.models.split(' '),
      amplification: options.amplification,
      max_tokens: options.max_tokens,
      region: options.region,
      include_diff: options.include_diff,
      system: options.system_prompt
    })

    let watermark = patch.watermark

    if (debug) {
      watermark = options.bedrock_aws_iam_role_arn
        ? `bedrock debug - ${watermark}`
        : options.anthropic_api_key
          ? `anthropic debug - ${watermark}`
          : `openai debug - ${watermark}`
    }

    const header = options.include_diff || debug || context.actor.endsWith('[bot]')
      ? '<details><summary>Diff</summary>\n\n````````````diff\n\n' + filteredPatch + '\n\n````````````\n\n</details>'
      : ''

    await submitReview({
      owner: options.owner,
      repo: options.repo,
      prnum: options.prnum,
      watermark,
      header,
      explainPatch: explainPatchCb,
      debounceTime: options.debounce_time,
      debug,
      github
    })

    await github.rest.issues.addLabels({
      owner: options.owner,
      repo: options.repo,
      issue_number: options.prnum,
      labels: ['puLL-Merge']
    })
  } catch (error) {
    console.log(error)
    if (debug) throw error
  }
}
