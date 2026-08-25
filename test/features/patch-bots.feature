Feature: bot patch extraction
  getDependabotPatch and getRenovatePatch fetch the upstream dependency
  diff for bot PRs: parse the PR body for the target repo and version
  range, resolve matching tags, and fetch the compare diff.

  Background:
    Given owner "brave" and repo "pull-merge"
    And pr number 42

  Scenario: dependabot rejects a call without a github client or token
    When getDependabotPatch is called
    Then it rejects with "You must provide a githubToken to use this function"

  Scenario: dependabot extracts the upstream diff
    Given a github token "ghp_test"
    And the PR body:
      """
      Bumps [semgrep](https://github.com/semgrep/semgrep) from 1.53.0 to 1.54.0.

      Release notes are here.
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.52.0
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getDependabotPatch is called
    Then an Octokit client was constructed with auth "ghp_test"
    And the diff was fetched from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"
    And it resolves to:
      """
      {
        "repo": "semgrep",
        "owner": "semgrep",
        "type": "dependabot",
        "body": "THE DIFF BODY",
        "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [semgrep/semgrep@v1.53.0..v1.54.0](https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff)"
      }
      """

  Scenario: dependabot returns undefined for a non-bump PR body
    Given a github client
    And the PR body:
      """
      Just a regular PR body
      """
    When getDependabotPatch is called
    Then it resolves to undefined

  Scenario: dependabot fails when the diff cannot be fetched
    Given a github client
    And the PR body:
      """
      Bumps [semgrep](https://github.com/semgrep/semgrep) from 1.53.0 to 1.54.0.
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with status 404 "Not Found"
    When getDependabotPatch is called
    Then it rejects with "Could not fetch PR diff: 404 Not Found"

  Scenario: dependabot logs debug output
    Given a github client
    And debug is on
    And the PR body:
      """
      Bumps [semgrep](https://github.com/semgrep/semgrep) from 1.53.0 to 1.54.0.
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getDependabotPatch is called
    Then the error "getDependabotPatch brave pull-merge 42" was logged
    And the error "link: https://github.com/semgrep/semgrep, from: 1.53.0, to: 1.54.0, org: semgrep, repo: semgrep" was logged
    And the error "v1.53.0" was logged

  Scenario: dependabot watermark embeds repo and tags for any version
    When the dependabot patch property holds for 25 runs

  Scenario: renovate rejects a call without a github client or token
    When getRenovatePatch is called
    Then it rejects with "You must provide a githubToken to use this function"

  Scenario: renovate extracts the upstream diff
    Given a github client
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
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getRenovatePatch is called
    Then the diff was fetched from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"
    And it resolves to:
      """
      {
        "repo": "semgrep",
        "owner": "semgrep",
        "type": "renovate",
        "body": "THE DIFF BODY",
        "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [semgrep/semgrep@v1.53.0..v1.54.0](https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff)"
      }
      """

  Scenario: renovate constructs an Octokit client from a token
    Given a github token "ghp_test"
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
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getRenovatePatch is called
    Then an Octokit client was constructed with auth "ghp_test"
    And the diff was fetched from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"

  Scenario: renovate handles action updates
    Given a github client
    And the PR body:
      """
      This PR contains the following updates:

      | Package | Type | Update | Change |
      |---|---|---|---|
      | [actions/checkout](https://redirect.github.com/actions/checkout) | action | minor | v4.1.0 -> v4.1.2 |
      """
    And the repo "actions/checkout" has tags:
      """
      v4.1.0
      v4.1.2
      """
    And the compare diff at "https://github.com/actions/checkout/compare/v4.1.0..v4.1.2.diff" responds with:
      """
      ACTION DIFF
      """
    When getRenovatePatch is called
    Then the diff was fetched from "https://github.com/actions/checkout/compare/v4.1.0..v4.1.2.diff"
    And it resolves to:
      """
      {
        "repo": "checkout",
        "owner": "actions",
        "type": "renovate",
        "body": "ACTION DIFF",
        "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [actions/checkout@v4.1.0..v4.1.2](https://github.com/actions/checkout/compare/v4.1.0..v4.1.2.diff)"
      }
      """

  Scenario: renovate strips backticks and a releases suffix
    Given a github client
    And markdownToTxt strips backticks
    And the PR body:
      """
      This PR contains the following updates:

      | Package | Change |
      |---|---|
      | [semgrep](https://redirect.github.com/semgrep/semgrep/releases) | `1.53.0` -> `1.54.0` |
      """
    And the repo "semgrep/semgrep" has tags:
      """
      v1.53.0
      v1.54.0
      """
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getRenovatePatch is called
    Then the diff was fetched from "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff"

  Scenario: renovate fails when the diff cannot be fetched
    Given a github client
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
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with status 500 "Internal Server Error"
    When getRenovatePatch is called
    Then it rejects with "Could not fetch PR diff: 500 Internal Server Error"

  Scenario: renovate logs debug output
    Given a github client
    And debug is on
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
    And the compare diff at "https://github.com/semgrep/semgrep/compare/v1.53.0..v1.54.0.diff" responds with:
      """
      THE DIFF BODY
      """
    When getRenovatePatch is called
    Then the error "getRenovatePatch brave pull-merge 42" was logged
    And the error "repository" was logged
    And the error "v1.53.0" was logged
    And the error "changeLine: " was logged
    And the error "link: https://github.com/semgrep/semgrep, versions: 1.53.0 -> 1.54.0" was logged

  Scenario: renovate watermark embeds repo and tags for any version
    When the renovate patch property holds for 25 runs
