import { mockState } from './state.mjs'

function recordRest (group, method) {
  return async (params) => {
    const st = mockState().github
    const key = `${group}.${method}`
    st.restCalls[key] = st.restCalls[key] || []
    st.restCalls[key].push(params)
    const reply = st.restReplies[key]
    if (reply instanceof Error) throw reply
    return reply
  }
}

export function makeGithub () {
  return {
    request: async (route, opts) => {
      const st = mockState().github
      st.requestCalls.push({ route, opts })
      for (const r of st.requestRoutes) {
        if (r.match(route)) {
          if (r.error) throw r.error
          return typeof r.reply === 'function' ? r.reply(opts) : r.reply
        }
      }
      throw new Error(`fake github: unexpected request ${route}`)
    },
    graphql: async (query, variables) => {
      const st = mockState().github
      st.graphqlCalls.push({ query, variables })
      for (const r of st.graphqlRoutes) {
        const matched = typeof r.match === 'function' ? r.match(query) : r.match.test(query)
        if (matched) {
          if (r.error) throw r.error
          return typeof r.reply === 'function' ? r.reply(variables) : r.reply
        }
      }
      throw new Error(`fake github: unexpected graphql query: ${query.slice(0, 80)}`)
    },
    rest: {
      repos: {
        getContent: recordRest('repos', 'getContent')
      },
      issues: {
        createComment: recordRest('issues', 'createComment'),
        addLabels: recordRest('issues', 'addLabels')
      }
    }
  }
}
