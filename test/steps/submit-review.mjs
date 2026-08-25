import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import fc from 'fast-check'
import { makeGithub } from '../support/fake-github.mjs'
import { mockState, resetState } from '../support/state.mjs'

const trimDoc = (doc) => doc.replace(/\n$/, '')

const isCommentsQuery = (q) => q.includes('comments(last: 100)')
const isPRQuery = (q) => q.includes('pullRequest') && !q.includes('comments')
const isDeleteMutation = (q) => q.includes('deleteIssueComment')
const isUpdateMutation = (q) => q.includes('updatePullRequest')

Given('pr number {int}', function (prnum) {
  this.prnum = prnum
})

Given('watermark {string}', function (watermark) {
  this.watermark = watermark
})

Given('debounce time {float} hours', function (debounceTime) {
  this.debounceTime = debounceTime
})

Given('header:', function (doc) {
  this.header = trimDoc(doc)
})

Given('the explanation callback returns:', function (doc) {
  this.explainPatch = async () => trimDoc(doc)
})

Given('the explanation callback returns nothing', function () {
  this.explainPatch = async () => ''
})

Given('the PR has these comments:', function (table) {
  const st = mockState().github
  st.graphqlRoutes = st.graphqlRoutes.filter((r) => !r.isCommentsRoute && !r.isDeleteRoute)
  const nodes = table.hashes().map((row) => ({
    id: row.id,
    author: { login: 'someone' },
    body: row.body,
    updatedAt: new Date(Date.now() - parseFloat(row.age_hours) * 3600e3).toISOString()
  }))
  st.graphqlRoutes.push({
    isCommentsRoute: true,
    match: isCommentsQuery,
    reply: { repository: { pullRequest: { comments: { nodes } } } }
  })
  st.graphqlRoutes.push({ isDeleteRoute: true, match: isDeleteMutation, reply: {} })
})

Given('the PR description:', function (doc) {
  this.prBody = trimDoc(doc)
  this.prBodyLater = null
  const st = mockState().github
  st.graphqlRoutes = st.graphqlRoutes.filter((r) => !r.isPRRoute && !r.isUpdateRoute)
  let fetches = 0
  st.graphqlRoutes.push({
    isPRRoute: true,
    match: isPRQuery,
    reply: () => {
      fetches += 1
      const body = fetches === 1 || this.prBodyLater === null ? this.prBody : this.prBodyLater
      const pullRequest = { id: 'PR_1', body }
      if (this.prUpdatedAtAge !== undefined) {
        pullRequest.updatedAt = new Date(Date.now() - this.prUpdatedAtAge * 3600e3).toISOString()
      }
      return { repository: { pullRequest } }
    }
  })
  st.graphqlRoutes.push({ isUpdateRoute: true, match: isUpdateMutation, reply: {} })
})

Given('the PR description is then:', function (doc) {
  this.prBodyLater = trimDoc(doc)
})

Given('the PR description was last updated {float} hours ago', function (age) {
  this.prUpdatedAtAge = age
})

async function callModule (world, name) {
  const { default: fn } = await import(`../../src/${name}.js`)
  world.error = null
  world.result = undefined
  try {
    world.result = await fn({
      owner: world.owner,
      repo: world.repo,
      prnum: world.prnum,
      watermark: world.watermark,
      debounceTime: world.debounceTime,
      ...(world.explainPatch ? { explainPatch: world.explainPatch } : {}),
      githubToken: world.githubToken ?? null,
      header: world.header ?? '',
      github: world.github ?? null,
      debug: world.debug ?? false
    })
  } catch (err) {
    world.error = err
  }
}

When('submitReview is called', async function () {
  await callModule(this, 'submitReview')
})

When('subtleSubmitReview is called', async function () {
  await callModule(this, 'subtleSubmitReview')
})

Then('it returns true', function () {
  expect(this.error).to.equal(null)
  expect(this.result).to.equal(true)
})

Then('it returns undefined', function () {
  expect(this.error).to.equal(null)
  expect(this.result).to.equal(undefined)
})

Then('a comment was created with body:', function (doc) {
  const calls = mockState().github.restCalls['issues.createComment']
  expect(calls).to.have.lengthOf(1)
  expect(calls[0]).to.deep.equal({
    owner: this.owner,
    repo: this.repo,
    issue_number: this.prnum,
    body: trimDoc(doc)
  })
})

Then('no comment was created', function () {
  expect(mockState().github.restCalls['issues.createComment']).to.equal(undefined)
})

Then('comment {string} was deleted', function (id) {
  const calls = mockState().github.graphqlCalls.filter((c) => isDeleteMutation(c.query))
  expect(calls.some((c) => c.variables.id === id)).to.equal(true)
})

Then('comment {string} was not deleted', function (id) {
  const calls = mockState().github.graphqlCalls.filter((c) => isDeleteMutation(c.query))
  expect(calls.some((c) => c.variables.id === id)).to.equal(false)
})

Then('no Octokit client was constructed', function () {
  expect(mockState().octokit.constructorArgs).to.have.lengthOf(0)
})

Then('the PR description was updated to:', function (doc) {
  const calls = mockState().github.graphqlCalls.filter((c) => isUpdateMutation(c.query))
  expect(calls).to.have.lengthOf(1)
  expect(calls[0].variables).to.deep.equal({ prId: 'PR_1', body: trimDoc(doc) })
})

When('the submitReview debounce property holds for {int} runs', async function (runs) {
  const { default: submitReview } = await import('../../src/submitReview.js')
  const property = fc.asyncProperty(
    fc.integer({ min: 0, max: 48 }),
    fc.integer({ min: 1, max: 72 }),
    async (hours, futureHours) => {
      resetState()
      const github = makeGithub()
      mockState().github.graphqlRoutes.push({
        match: isCommentsQuery,
        reply: {
          repository: {
            pullRequest: {
              comments: {
                nodes: [
                  {
                    id: 'C1',
                    author: { login: 'bot' },
                    body: 'review wm-1 done',
                    updatedAt: new Date(Date.now() + futureHours * 3600e3).toISOString()
                  }
                ]
              }
            }
          }
        }
      })
      mockState().github.graphqlRoutes.push({ match: isDeleteMutation, reply: {} })
      const result = await submitReview({
        owner: 'o',
        repo: 'r',
        prnum: 1,
        watermark: 'wm-1',
        debounceTime: hours,
        github
      })
      expect(result).to.equal(true)
      expect(mockState().github.restCalls['issues.createComment']).to.equal(undefined)
      expect(mockState().github.graphqlCalls.filter((c) => isDeleteMutation(c.query))).to.have.lengthOf(0)
    }
  )
  await fc.assert(property, { numRuns: runs })
})

When('the submitReview re-submission property holds for {int} runs', async function (runs) {
  const { default: submitReview } = await import('../../src/submitReview.js')
  const property = fc.asyncProperty(
    fc.integer({ min: 0, max: 48 }),
    fc.integer({ min: 1, max: 72 }),
    async (hours, extraHours) => {
      resetState()
      const github = makeGithub()
      mockState().github.graphqlRoutes.push({
        match: isCommentsQuery,
        reply: {
          repository: {
            pullRequest: {
              comments: {
                nodes: [
                  {
                    id: 'C1',
                    author: { login: 'bot' },
                    body: 'review wm-1 done',
                    updatedAt: new Date(Date.now() - (hours + extraHours) * 3600e3).toISOString()
                  }
                ]
              }
            }
          }
        }
      })
      mockState().github.graphqlRoutes.push({ match: isDeleteMutation, reply: {} })
      const result = await submitReview({
        owner: 'o',
        repo: 'r',
        prnum: 1,
        watermark: 'wm-1',
        debounceTime: hours,
        github
      })
      expect(result).to.equal(undefined)
      const deletes = mockState().github.graphqlCalls.filter((c) => isDeleteMutation(c.query))
      expect(deletes).to.have.lengthOf(1)
      expect(deletes[0].variables).to.deep.equal({ id: 'C1' })
      const comments = mockState().github.restCalls['issues.createComment']
      expect(comments).to.have.lengthOf(1)
      expect(comments[0].body).to.contain('no explanation provided<!-- Generated by STUB -->')
    }
  )
  await fc.assert(property, { numRuns: runs })
})

When('the review replacement property holds for {int} runs', async function (runs) {
  const { default: subtleSubmitReview } = await import('../../src/subtleSubmitReview.js')
  const safeText = fc.array(fc.constantFrom('a', 'b', 'c', ' ', '.', '\n'), { maxLength: 20 })
    .map((chars) => chars.join(''))
  const modelName = fc.integer({ min: 0, max: 9999 }).map((n) => `model${n}`)
  const property = fc.asyncProperty(safeText, safeText, safeText, modelName, async (prefix, suffix, inner, model) => {
    resetState()
    const wm = 'WM'
    const explanation = 'EXPL'
    const block = '<details><summary>AI Review</summary>\n\n' + wm + '\n\n\n\n' + inner + '<!-- Generated by ' + model + ' --></details>'
    const fullBody = prefix + block + suffix
    let fetches = 0
    const github = makeGithub()
    mockState().github.graphqlRoutes.push({
      match: isPRQuery,
      reply: () => {
        fetches += 1
        return { repository: { pullRequest: { id: 'PR_1', body: fetches === 1 ? prefix + suffix : fullBody } } }
      }
    })
    mockState().github.graphqlRoutes.push({ match: isUpdateMutation, reply: {} })
    await subtleSubmitReview({
      owner: 'o',
      repo: 'r',
      prnum: 1,
      watermark: wm,
      debounceTime: 6,
      explainPatch: async () => explanation,
      github
    })
    const updates = mockState().github.graphqlCalls.filter((c) => isUpdateMutation(c.query))
    expect(updates).to.have.lengthOf(1)
    const expectedBlock = '<details><summary>AI Review</summary>\n\n' + wm + '\n\n\n\n' + explanation + '</details>'
    expect(updates[0].variables.body).to.equal(prefix + expectedBlock + suffix)
    expect(updates[0].variables.prId).to.equal('PR_1')
  })
  await fc.assert(property, { numRuns: runs })
})
