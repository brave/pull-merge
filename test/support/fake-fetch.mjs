import { mockState } from './state.mjs'

export async function hermeticFetch (url, opts) {
  const st = mockState()
  st.fetchCalls.push({ url: String(url), opts })
  for (const route of st.fetchRoutes) {
    const matched = typeof route.match === 'function' ? route.match(String(url)) : route.match.test(String(url))
    if (matched) {
      if (route.error) throw route.error
      return {
        status: route.status ?? 200,
        statusText: route.statusText ?? 'OK',
        text: async () => route.body ?? ''
      }
    }
  }
  throw new Error(`hermetic fetch: unexpected request ${url}`)
}
