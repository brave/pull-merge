/* eslint-disable camelcase */
import quibble from 'quibble'
import OpenAI from './mock-openai.mjs'
import Anthropic from './mock-anthropic.mjs'
import { countTokens, encoding_for_model, get_encoding } from './mock-tokenizers.mjs'
import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  SSMClient,
  GetParameterCommand
} from './mock-bedrock.mjs'
import { Octokit } from './mock-octokit.mjs'
import { markdownToTxt } from './mock-markdown.mjs'
import { fsStubs } from './mock-fs.mjs'

await quibble.esm('openai', {}, OpenAI)
await quibble.esm('@anthropic-ai/sdk', {}, Anthropic)
await quibble.esm('@anthropic-ai/tokenizer', { countTokens })
await quibble.esm('tiktoken', { encoding_for_model, get_encoding })
await quibble.esm('@aws-sdk/client-bedrock-runtime', { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand })
await quibble.esm('@aws-sdk/client-ssm', { SSMClient, GetParameterCommand })
await quibble.esm('@octokit/core', { Octokit })
await quibble.esm('markdown-to-txt', { markdownToTxt })
await quibble.esm('fs/promises', fsStubs)
