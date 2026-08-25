Feature: getProperties reads custom repo properties
  Business rule: repository properties become options. Names carrying
  the pull_merge_ prefix lose it and override any plain twin. Note the
  quirk: with no prefix every name matches the empty prefix check and
  nothing is copied. Any failure means no properties: an empty object
  plus a logged error.

  Background:
    Given owner "myorg" and repo "myrepo"
    And a github client

  Scenario: prefixed properties are stripped and override plain ones
    Given repo properties:
      | property_name            | value   |
      | debounce_time            | 9       |
      | pull_merge_debounce_time | 42      |
      | pull_merge_include_diff  | true    |
      | other                    | plain   |
    When getProperties is called with prefix "pull_merge_"
    Then it resolves to:
      """
      {"debounce_time": "42", "other": "plain", "include_diff": "true"}
      """
    And the properties endpoint was requested for owner "myorg" repo "myrepo"

  Scenario: properties without the prefix pass through untouched
    Given repo properties:
      | property_name     | value |
      | debounce_time     | 9     |
      | include_diff      | true  |
    When getProperties is called with prefix "pull_merge_"
    Then it resolves to:
      """
      {"debounce_time": "9", "include_diff": "true"}
      """

  Scenario: no prefix copies nothing because every string starts with ""
    Given repo properties:
      | property_name | value |
      | debounce_time | 9     |
    When getProperties is called without a prefix
    Then it resolves to:
      """
      {}
      """

  Scenario: request failure returns empty properties and logs the error
    Given the properties endpoint fails with "properties not available"
    When getProperties is called with prefix "pull_merge_"
    Then it resolves to:
      """
      {}
      """
    And the error "properties not available" was logged

  Scenario: debug logs the raw properties response
    Given repo properties:
      | property_name | value |
      | debounce_time | 9     |
    And debug is on
    When getProperties is called with prefix "pull_merge_"
    Then the raw properties response was logged

  Scenario: a token builds an Octokit client behind the scenes
    Given repo properties:
      | property_name     | value |
      | pull_merge_debug  | true  |
    And a github token "gh_token_123"
    When getProperties is called with prefix "pull_merge_"
    Then it resolves to:
      """
      {"debug": "true"}
      """
    And an Octokit client was constructed with auth "gh_token_123"

  @property
  Scenario: prefix stripping and override semantics hold for any property set
    When the property merge semantics property holds for 100 runs
