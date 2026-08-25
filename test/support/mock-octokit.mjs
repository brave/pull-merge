import { mockState } from './state.mjs'
import { makeGithub } from './fake-github.mjs'

export class Octokit {
  constructor (opts) {
    mockState().octokit.constructorArgs.push(opts)
    const gh = makeGithub()
    this.request = gh.request
    this.graphql = gh.graphql
    this.rest = gh.rest
  }
}
