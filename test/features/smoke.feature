Feature: Test infrastructure smoke
  Validates that the BDD harness, ESM module mocks, hermetic fetch guard
  and PATH shims all work together before any source module is tested.

  Scenario: quibble replaces the OpenAI SDK for lazily imported modules
    When a probe module constructs an OpenAI client with apiKey "test-key"
    Then the OpenAI mock records the constructor argument apiKey "test-key"

  Scenario: fetch is hermetic by default
    When fetch is called for "https://example.com/pr.diff"
    Then fetch throws a hermetic network error

  Scenario: registered fetch routes are served
    Given a fetch route matching "example.com/.*" with status 200 and body "hello diff"
    When fetch is called for "https://example.com/pr.diff"
    Then the response status is 200 and text is "hello diff"

  Scenario: filterdiff shim is reachable on PATH
    When the filterdiff shim is spawned with content "hello patch"
    Then the shim echoes the content back
