module.exports = async ({ github, context, inputs, actionPath }) => {
  const { default: filterdiff } = await import(`${actionPath}/src/filterdiff.js`)
  const { default: getConfig } = await import(`${actionPath}/src/getConfig.js`)
  const { default: getProperties } = await import(`${actionPath}/src/getProperties.js`)

  // delete if empty string in inputs value
  Object.keys(inputs).forEach(key => inputs[key] === '' && delete inputs[key])

  let debug = process.env.DEBUG === 'true'
  if (debug) console.log('Initializing puLL-Merge')

  const config = await getConfig({ owner: context.repo.owner, repo: context.repo.repo, path: '.github/pull-merge.json', debug, github })
  const properties = await getProperties({ owner: context.repo.owner, repo: context.repo.repo, debug, github })

  const options = Object.assign({
    debounce_time: '6',
    amplification: '4',
    filterdiff_args: '--exclude=**/package-lock.json --exclude=**/yarn.lock --exclude=**/*.js.map --exclude=**/*.svg --exclude=**/test/data/**/* --exclude=**/docs/**/* --exclude=**/deploy/**/* --exclude=**/.htpasswd',
    openai_models: 'gpt-4-turbo-2024-04-09 gpt-3.5-turbo-0125',
    anthropic_models: 'claude-3-opus-20240229',
    bedrock_models: 'anthropic.claude-3-opus-20240229-v1:0',
    owner: context.repo.owner,
    repo: context.repo.repo,
    prnum: context.issue.number,
    max_tokens: '2048',
    subtle_mode: 'false'
  }, config, properties, inputs)

  // convert to numbers some options
  options.debounce_time = parseFloat(options.debounce_time, 10)
  options.amplification = parseFloat(options.amplification, 10)
  options.prnum = parseFloat(options.prnum, 10)
  options.max_tokens = parseFloat(options.max_tokens, 10)
  options.subtle_mode = options.subtle_mode === 'true'

  const { default: explainPatch } =
    options.bedrock_aws_iam_role_arn
      ? await import(`${actionPath}/src/bedrockExplainPatch.js`)
      : options.anthropic_api_key
        ? await import(`${actionPath}/src/anthropicExplainPatch.js`)
        : await import(`${actionPath}/src/openaiExplainPatch.js`)

  const { default: submitReview } = options.subtle_mode
    ? await import(`${actionPath}/src/subtleSubmitReview.js`)
    : await import(`${actionPath}/src/submitReview.js`)

  const { default: getPatch } = (context.payload.pull_request && context.payload.pull_request.user.login === 'renovate[bot]') || context.actor === 'renovate[bot]'
    ? await import(`${actionPath}/src/getRenovatePatch.js`)
    : (context.payload.pull_request && context.payload.pull_request.user.login === 'dependabot[bot]') || context.actor === 'dependabot[bot]'
        ? await import(`${actionPath}/src/getDependabotPatch.js`)
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

  try {
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
      region: options.region
    })

    let watermark = patch.watermark

    if (debug) {
      watermark = options.bedrock_aws_iam_role_arn
        ? `bedrock debug - ${watermark}`
        : options.anthropic_api_key
          ? `anthropic debug - ${watermark}`
          : `openai debug - ${watermark}`
    }

    await submitReview({
      owner: options.owner,
      repo: options.repo,
      prnum: options.prnum,
      watermark,
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
