Feature: Transient network fetches are retried with exponential backoff
  Business rule: single-shot diff fetches died on transient CDN/registry
  failures (5xx, timeouts, connection resets) and killed the whole review.
  Every per-attempt fetch behind fetchWithRetry retries transient failures
  with exponential backoff — 5 attempts, delay min(2^i * 2s, 60s) — while
  deterministic 4xx responses fail fast after a single attempt.

  Scenario: transient 503s are retried until success
    Given a per-attempt fetch returning HTTP 503 twice then 200 with body "DIFF"
    And the fetch backoff is disabled
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then it resolves with HTTP 200 and body "DIFF"
    And the per-attempt fetch was called 3 times

  Scenario: a deterministic 404 fails fast
    Given a per-attempt fetch returning HTTP 404 on every attempt
    And the fetch backoff is disabled
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then it returns the HTTP 404 response
    And the per-attempt fetch was called 1 time

  Scenario: a thrown non-transient error is not retried
    Given a per-attempt fetch that throws an HTTP 403 error
    And the fetch backoff is disabled
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then it rejects with "HTTP 403 Forbidden"
    And the per-attempt fetch was called 1 time

  Scenario: always-5xx exhausts the attempt budget
    Given a per-attempt fetch returning HTTP 503 on every attempt
    And the fetch backoff is disabled
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then it returns the HTTP 503 response
    And the per-attempt fetch was called 5 times

  Scenario: network-level errors are retried then rethrown
    Given a per-attempt fetch that fails with the network error "connection reset"
    And fetchWithRetry is limited to 2 attempts
    And the fetch backoff is disabled
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then it rejects with "connection reset"
    And the per-attempt fetch was called 2 times

  Scenario: delays follow min(2^i * 2s, 60s)
    Given a per-attempt fetch returning HTTP 503 on every attempt
    And the fetch backoff is recorded
    When fetchWithRetry fetches "https://github.com/o/r/pull/42.diff"
    Then the delays between attempts were 2000, 4000, 8000, 16000 milliseconds

  Scenario: retry delays cap at 60 seconds
    Then retryDelayMs is 2000 at attempt 0 and capped at 60000 from attempt 6

  Scenario: requestOnce follows release redirects
    Given a local server that redirects once to the body "from-cdn"
    When requestOnce fetches the local URL
    Then it resolves with body "from-cdn"

  Scenario: a stalled attempt is timed out and retried
    Given a local server that stalls the first request then serves "recovered"
    And the fetch backoff is disabled
    When fetchWithRetry fetches the local URL with a 100ms attempt timeout
    Then it resolves with body "recovered"
    And the local server saw 2 requests

  Scenario: getPatch retries a transient 503 on the anonymous diff fetch
    Given owner "brave" and repo "pull-merge"
    And pr number 42
    And the public diff at "https://github.com/brave/pull-merge/pull/42.diff" responds with HTTP 503 twice then succeeds with:
      """
      diff --git a/x.js b/x.js
      """
    And the fetch backoff is disabled
    When getPatch is called
    Then it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff --git a/x.js b/x.js", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """
    And the diff was fetched 3 times from "https://github.com/brave/pull-merge/pull/42.diff"

  Scenario: getDependabotPatch retries a transient 503 on the compare diff
    Given owner "brave" and repo "pull-merge"
    And pr number 42
    And a github token "ghp_test"
    And the PR body:
      """
      Bumps [semgrep](https://github.com/semgrep/semgrep) from 1.53.0 to 1.54.0.
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with HTTP 503 twice then succeeds with:
      """
      THE DIFF BODY
      """
    And the fetch backoff is disabled
    When getDependabotPatch is called
    Then it resolves to:
      """
      {
        "repo": "semgrep",
        "owner": "semgrep",
        "type": "dependabot",
        "body": "THE DIFF BODY",
        "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [semgrep/semgrep@v1.53.0..v1.54.0](https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff)"
      }
      """
    And the diff was fetched 3 times from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"

  Scenario: getRenovatePatch retries a transient 503 on the compare diff
    Given owner "brave" and repo "pull-merge"
    And pr number 42
    And a github client
    And the PR body:
      """
      This PR contains the following updates:

      | Package | Change |
      |---|---|
      | [semgrep](https://redirect.github.com/semgrep/semgrep) | 1.53.0 -> 1.54.0 |
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with HTTP 503 twice then succeeds with:
      """
      THE DIFF BODY
      """
    And the fetch backoff is disabled
    When getRenovatePatch is called
    Then it resolves to:
      """
      {
        "repo": "semgrep",
        "owner": "semgrep",
        "type": "renovate",
        "body": "THE DIFF BODY",
        "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [semgrep/semgrep@v1.53.0..v1.54.0](https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff)"
      }
      """
    And the diff was fetched 3 times from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"
