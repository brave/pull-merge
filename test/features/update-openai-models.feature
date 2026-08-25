Feature: OpenAI model update script
  Refreshes the default OpenAI model identifiers from the public docs.
  The CLI entry point is guarded so importing the module for tests never runs main.

  Scenario: importing the module does not run main
    When the openai script module is imported
    Then the process did not exit
    And no fetch was made

  Scenario: extracting the latest models from the documentation
    Given the docs page at "https://platform.openai.com/docs/models" contains:
      """
      GPT-5.3-Codex gpt-4o-2024-05-13 gpt-3.5-turbo-0125
      """
    When the openai script module is imported
    And openai fetchLatestModels is called
    Then it resolves to:
      """
      {"codex":"gpt-5.3-codex","gpt4o":"gpt-4o-2024-05-13","gpt35":"gpt-3.5-turbo-0125"}
      """

  Scenario: falling back to hardcoded defaults when nothing matches
    Given the docs page at "https://platform.openai.com/docs/models" contains:
      """
      no models here
      """
    When the openai script module is imported
    And openai fetchLatestModels is called
    Then it resolves to:
      """
      {"codex":"gpt-5.3-codex","gpt4o":"gpt-4o-2024-05-13","gpt35":"gpt-3.5-turbo-0125"}
      """
    And a log line containing "Warning: Could not find model identifiers in OpenAI documentation" was recorded

  Scenario: no changes when the defaults already match
    Given the docs page at "https://platform.openai.com/docs/models" contains:
      """
      GPT-5.3-Codex
      """
    When the openai script module is imported
    And openai main is called
    Then the process exited with code 1
    And a log line containing "already up to date" was recorded
    And the file "action.cjs" was not written
    And the file "src/openaiExplainPatch.js" was not written

  Scenario: updating to the latest GPT-4o model
    Given the docs page at "https://platform.openai.com/docs/models" contains:
      """
      gpt-4o-2025-03-01 gpt-3.5-turbo-0125
      """
    When the openai script module is imported
    And openai main is called
    Then the process exited with code 0
    And the file "action.cjs" was written containing:
      """
      openai_models: 'gpt-4o-2025-03-01'
      """
    And the file "src/openaiExplainPatch.js" was written containing:
      """
      models = ['gpt-4o-2025-03-01']
      """
    And a log line containing "Updated action.cjs" was recorded

  Scenario: exiting with an error when the docs are unreachable
    Given the docs page at "https://platform.openai.com/docs/models" is unreachable
    When the openai script module is imported
    And openai main is called
    Then the process exited with code 1
    And a log line containing "Error updating models:" was recorded
