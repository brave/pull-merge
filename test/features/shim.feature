Feature: github-script surface shim
  The prebuilt image runs action.cjs inside the job container through
  run.cjs; the github-script injected surface is rebuilt by src/shim.js
  from the runner environment.

  Scenario: the shim builds the action context from runner environment
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    When the shim builds the github-script surface
    Then the context repo is "brave/core"
    And the context event name is "pull_request"
    And the context actor is the runner actor
    And the context issue number is 42
    And the context payload mirrors the event file

  Scenario: the shim core emits runner annotations for warnings and failures
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    When the shim builds the github-script surface
    Then core warning emits a warning annotation
    And core error emits an error annotation
    And core notice emits a notice annotation
    And core setFailed emits an error annotation and fails the step

  Scenario: the shim core writes multiline outputs and variables with a delimiter
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    And GITHUB_ENV and GITHUB_STEP_SUMMARY files are configured
    When the shim builds the github-script surface
    Then core setOutput appends to the GITHUB_OUTPUT file for single-line values
    And core setOutput appends a delimited block for a multiline value
    And core exportVariable appends a delimited block for a multiline value

  Scenario: the shim core resolves inputs from the runner environment
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    And an INPUT_GITHUB_TOKEN environment entry of "ghs-input"
    When the shim builds the github-script surface
    Then core getInput returns the environment input
    And core getInput throws for a missing required input

  Scenario: the shim core writes the job summary file
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    And GITHUB_ENV and GITHUB_STEP_SUMMARY files are configured
    When the shim builds the github-script surface
    Then core summary writes the rendered markdown to GITHUB_STEP_SUMMARY

  Scenario: the shim github client authenticates with the runner token
    Given a runner environment with repository "brave/core" and event "pull_request"
    And an event payload file describing pull request 42
    And a GITHUB_TOKEN of "ghs-test"
    When the shim builds the github-script surface
    Then the shim octokit is authenticated with the runner token
