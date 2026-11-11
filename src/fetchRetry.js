/**
 * Retry-with-backoff wrapper for transient network fetches.
 *
 * Single-shot fetches died on transient CDN/registry failures (5xx during
 * the Oct 22 npmjs outage, release-CDN 504s). This wraps the per-attempt
 * fetch in an exponential-backoff loop: RETRY_ATTEMPTS attempts, delay =
 * min(2^attempt * 2s, 60s), so the total added retry budget stays bounded
 * (~2 min).
 *
 * Only transient failures are retried: HTTP 5xx, per-attempt timeouts and
 * network-level errors (DNS, connection reset, abort). 4xx responses are
 * deterministic (403 permission, 404 missing asset) and fail fast after a
 * single attempt.
 *
 * fetchWithRetry resolves with the final HTTP response — including a 5xx
 * after the attempt budget is exhausted — so callers keep their own status
 * handling and error messages. It rejects only for network-level errors
 * that survive every attempt, or when the per-attempt fetch throws a
 * non-transient error.
 */

export const RETRY_ATTEMPTS = 5
export const RETRY_BASE_DELAY_MS = 2000
export const RETRY_MAX_DELAY_MS = 60000
// Per-attempt stall guard: a hung connection is a transient failure, but it
// must not consume the whole retry budget on a single attempt.
export const ATTEMPT_TIMEOUT_MS = 60000

/**
 * Delay before retry number `attempt` (0-based): 2s, 4s, 8s, 16s … capped at
 * `maxDelayMs`.
 */
export function retryDelayMs (attempt, baseDelayMs = RETRY_BASE_DELAY_MS, maxDelayMs = RETRY_MAX_DELAY_MS) {
  return Math.min(baseDelayMs * (2 ** attempt), maxDelayMs)
}

/**
 * Whether one fetch-attempt error is worth retrying. Network-level errors
 * (no statusCode) and HTTP 5xx are transient; every 4xx is deterministic.
 */
export function isTransientError (err) {
  const status = err?.statusCode
  if (status === undefined) return true
  return status >= 500
}

/**
 * One fetch attempt: GET `url` via global fetch (redirects are followed by
 * the runtime), guarded by `timeoutMs` so a stalled connection is aborted
 * and becomes a retryable transient failure.
 */
export async function requestOnce (url, { timeoutMs = ATTEMPT_TIMEOUT_MS } = {}) {
  const opts = timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}
  return globalThis.fetch(url, opts)
}

/**
 * Fetch `url` with exponential backoff across transient failures.
 *
 * Test seams (all optional):
 * - fetchOnce: replaces requestOnce (url, {timeoutMs} -> Response-like)
 * - sleep: replaces the delay between attempts (ms -> Promise)
 * - log: replaces console.log
 */
export async function fetchWithRetry (url, {
  attempts = RETRY_ATTEMPTS,
  baseDelayMs = RETRY_BASE_DELAY_MS,
  maxDelayMs = RETRY_MAX_DELAY_MS,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
  fetchOnce = requestOnce,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log
} = {}) {
  let lastError = null
  let lastResponse = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      const delay = retryDelayMs(attempt - 2, baseDelayMs, maxDelayMs)
      log(`Fetch attempt ${attempt - 1}/${attempts} failed transiently (${lastError.message}); retrying in ${delay}ms`)
      await sleep(delay)
    }
    try {
      const response = await fetchOnce(url, { timeoutMs })
      if (response.status < 500) return response
      // Transient HTTP failure (5xx): remember it and back off.
      lastResponse = response
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`)
      lastError.statusCode = response.status
    } catch (err) {
      lastError = err
      if (!isTransientError(err)) throw err
    }
  }
  if (lastResponse) return lastResponse
  throw lastError
}
