Feature: Anthropic model update script
  Refreshes the default Anthropic model identifiers from the public docs.
  The CLI entry point is guarded so importing the module for tests never runs main.

  Scenario: importing the module does not run main
    When the anthropic script module is imported
    Then the process did not exit
    And no fetch was made

  Scenario: extracting the latest models from the documentation
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" contains:
      """
      claude-sonnet-4-5-20250929 claude-sonnet-4-6 anthropic.claude-sonnet-4-6-v1:0 claude-haiku-4-5 anthropic.claude-haiku-4-5 claude-opus-4-6 claude-opus-47 claude-opus-4-7 anthropic.claude-opus-4-6-v1:0
      """
    When the anthropic script module is imported
    And anthropic fetchLatestModels is called
    Then it resolves to:
      """
      {"sonnet":{"anthropic":"claude-sonnet-4-6","bedrock":"global.anthropic.claude-sonnet-4-6-v1:0"},"haiku":{"anthropic":"claude-haiku-4-5","bedrock":"global.anthropic.claude-haiku-4-5-v1:0"},"opus":{"anthropic":"claude-opus-4-7","bedrock":"global.anthropic.claude-opus-4-6-v1:0"}}
      """

  Scenario: warning when a model family is missing from the docs
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" contains:
      """
      claude-sonnet-4-6 anthropic.claude-sonnet-4-6-v1:0
      """
    When the anthropic script module is imported
    And anthropic fetchLatestModels is called
    Then it resolves to:
      """
      {"sonnet":{"anthropic":"claude-sonnet-4-6","bedrock":"global.anthropic.claude-sonnet-4-6-v1:0"}}
      """
    And a log line containing "Warning: Could not find haiku model identifiers" was recorded
    And a log line containing "Warning: Could not find opus model identifiers" was recorded

  Scenario: failing when no model families are found
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" contains:
      """
      nothing relevant here
      """
    When the anthropic script module is imported
    And anthropic fetchLatestModels is called
    Then it rejects with "Could not find any Claude model identifiers in the documentation"

  Scenario: updating every default to the latest opus release
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" contains:
      """
      claude-sonnet-4-9 anthropic.claude-sonnet-4-9-v1:0 claude-haiku-4-9 anthropic.claude-haiku-4-9 claude-opus-4-9 claude-opus-47 claude-opus-4-7 anthropic.claude-opus-4-9-v1
      """
    When the anthropic script module is imported
    And anthropic main is called
    Then the process exited with code 0
    And the file "action.cjs" was written containing:
      """
      anthropic_models: 'claude-opus-4-9'
      """
    And the file "action.cjs" was written containing:
      """
      bedrock_models: 'global.anthropic.claude-opus-4-9-v1:0'
      """
    And the file "src/anthropicExplainPatch.js" was written containing:
      """
      models = ['claude-opus-4-9']
      """
    And the file "src/bedrockExplainPatch.js" was written containing:
      """
      models = ['global.anthropic.claude-opus-4-9-v1:0']
      """
    And the file "src/bedrockExplainPatch.js" was written containing:
      """
      'global.anthropic.claude-opus-4-9-v1:0': anthropicCountTokens
      """
    And a log line containing "Added 3 model(s) to COUNT_TOKENS_HASHFUN" was recorded
    And a log line containing "Updated action.cjs" was recorded

  Scenario: no changes when the defaults already match
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" contains:
      """
      claude-opus-5 anthropic.claude-opus-5-v1:0
      """
    When the anthropic script module is imported
    And anthropic main is called
    Then the process exited with code 1
    And a log line containing "already up to date" was recorded
    And a log line containing "Warning: Could not find sonnet model identifiers" was recorded
    And the file "action.cjs" was not written
    And the file "src/anthropicExplainPatch.js" was not written
    And the file "src/bedrockExplainPatch.js" was not written

  Scenario: exiting with an error when the docs are unreachable
    Given the docs page at "https://docs.claude.com/en/docs/about-claude/models/overview" is unreachable
    When the anthropic script module is imported
    And anthropic main is called
    Then the process exited with code 1
    And a log line containing "Error updating models:" was recorded

  Scenario: comparing model version segments
    When the anthropic script module is imported
    Then compareModelVersions ranks "claude-opus-4-6" and "claude-opus-4-5" as "greater"
    And compareModelVersions ranks "claude-opus-4-5" and "claude-opus-4-5-20250929" as "less"
    And compareModelVersions ranks "claude-sonnet-4" and "claude-opus-4" as "greater"
    And compareModelVersions ranks "claude-opus-4-20250514" and "claude-opus-4-5" as "less"
    And compareModelVersions ranks "claude-opus-4-5" and "claude-opus-4-5" as "equal"
    And compareModelVersions ranks "claude-x-4" and "claude-x-y" as "greater"

  Scenario: rejecting squashed version typos
    When the anthropic script module is imported
    Then isSquashedVersion flags "claude-opus-47" among:
      """
      claude-opus-47
      claude-opus-4-7
      """
    And isSquashedVersion keeps "claude-sonnet-4-10" among:
      """
      claude-sonnet-4-10
      """
    And isSquashedVersion keeps "claude-opus-4-5-20250929" among:
      """
      claude-opus-4-5-20250929
      """

  Scenario: the anthropic version ordering property holds for 25 runs
    When the anthropic script module is imported
    Then the anthropic version ordering property holds for 25 runs
