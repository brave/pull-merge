Feature: getConfig reads .github/pull-merge.json
  Business rule: repo config lives in a file fetched through the GitHub
  API, base64 decoded and JSON parsed. Any failure means no config: an
  empty object is returned instead of an error.

  Background:
    Given owner "myorg" and repo "myrepo"
    And a github client

  Scenario: config file is fetched, decoded and parsed
    Given a config file ".github/pull-merge.json" containing:
      """
      {"debounce_time": "12", "include_diff": "true"}
      """
    When getConfig is called with path ".github/pull-merge.json"
    Then it resolves to:
      """
      {"debounce_time": "12", "include_diff": "true"}
      """
    And getContent was called for owner "myorg" repo "myrepo" path ".github/pull-merge.json"

  Scenario: debug logs the decoded file content
    Given a config file ".github/pull-merge.json" containing:
      """
      {"a": 1}
      """
    And debug is on
    When getConfig is called with path ".github/pull-merge.json"
    Then the decoded content was logged

  Scenario: API failure returns an empty config
    Given the getContent endpoint fails with "not found"
    When getConfig is called with path ".github/pull-merge.json"
    Then it resolves to:
      """
      {}
      """

  Scenario: API failure with debug logs the error
    Given the getContent endpoint fails with "not found"
    And debug is on
    When getConfig is called with path ".github/pull-merge.json"
    Then the error "not found" was logged

  Scenario: a token builds an Octokit client behind the scenes
    Given a config file ".github/pull-merge.json" containing:
      """
      {"a": 1}
      """
    And a github token "gh_token_123"
    When getConfig is called with path ".github/pull-merge.json"
    Then it resolves to:
      """
      {"a": 1}
      """
    And an Octokit client was constructed with auth "gh_token_123"
