import { mockState } from './state.mjs'

/** Canonical statusText per status, so scripted responses read like real ones. */
export const STATUS_TEXT = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
}

/** Minimal fetch-Response stand-in: {status, statusText, text}. */
export function makeResponse (status, body = '', statusText) {
  return {
    status,
    statusText: statusText ?? STATUS_TEXT[status] ?? 'OK',
    text: async () => body
  }
}

export async function hermeticFetch (url, opts) {
  const st = mockState()
  st.fetchCalls.push({ url: String(url), opts })
  for (const route of st.fetchRoutes) {
    const matched = typeof route.match === 'function' ? route.match(String(url)) : route.match.test(String(url))
    if (matched) {
      // Scripted routes serve their entries in order (the last entry repeats):
      // a number is a bare status, otherwise {status, statusText, body}.
      if (route.script) {
        const idx = Math.min(route.scriptCalls ?? 0, route.script.length - 1)
        route.scriptCalls = (route.scriptCalls ?? 0) + 1
        const step = route.script[idx]
        return typeof step === 'number'
          ? makeResponse(step)
          : makeResponse(step.status ?? 200, step.body ?? '', step.statusText)
      }
      if (route.error) throw route.error
      return makeResponse(route.status ?? 200, route.body ?? '', route.statusText)
    }
  }
  throw new Error(`hermetic fetch: unexpected request ${url}`)
}
