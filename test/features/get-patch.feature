Feature: getPatch fetches the PR diff
  Business rule: three ways to obtain the patch body.
  1. Anonymous: plain HTTPS fetch of the .diff URL (no credentials at all).
  2. Authenticated: the GitHub API diff endpoint, falling back to a
     gh-clone plus git-diff when the endpoint fails.
  3. The privacy check rejects private repos unless runIfPrivate is set.

  Background:
    Given owner "brave" and repo "pull-merge"
    And pr number 42

  Scenario: fetches the diff anonymously over HTTPS
    Given the public diff at "https://github.com/brave/pull-merge/pull/42.diff" responds with:
      """
      diff --git a/x.js b/x.js
      """
    When getPatch is called
    Then it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff --git a/x.js b/x.js", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """
    And the diff was fetched from "https://github.com/brave/pull-merge/pull/42.diff"

  Scenario: logs the fetch context when debug is on
    Given the public diff at "https://github.com/brave/pull-merge/pull/42.diff" responds with:
      """
      diff body
      """
    And debug is on
    When getPatch is called
    Then the log line "getPatch brave pull-merge 42" was recorded
    And it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff body", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """

  Scenario: fails when the public diff is unavailable
    Given the public diff at "https://github.com/brave/pull-merge/pull/42.diff" responds with status 404 "Not Found"
    When getPatch is called
    Then it rejects with "Could not fetch PR diff: 404 Not Found"

  Scenario: builds an Octokit client from a token
    Given a github token "tok-123"
    And the pull diff endpoint replies with:
      """
      diff via api
      """
    And the repo is public
    When getPatch is called
    Then an Octokit client was constructed with auth "tok-123"
    And it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff via api", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """

  Scenario: fetches the diff through the github client
    Given a github client
    And the pull diff endpoint replies with:
      """
      diff via api
      """
    And the repo is public
    When getPatch is called
    Then 2 github requests were made
    And it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff via api", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """

  Scenario: rejects a private repo
    Given a github client
    And the pull diff endpoint replies with:
      """
      diff via api
      """
    And the repo is private
    When getPatch is called
    Then it rejects with "This repo is private, and you have not enabled runIfPrivate"

  Scenario: rejects a repo that is private by visibility
    Given a github client
    And the pull diff endpoint replies with:
      """
      diff via api
      """
    And the repo is private by visibility
    When getPatch is called
    Then it rejects with "This repo is private, and you have not enabled runIfPrivate"

  Scenario: allows a private repo when runIfPrivate is enabled
    Given a github client
    And the pull diff endpoint replies with:
      """
      diff via api
      """
    And the repo is private
    And runIfPrivate is enabled
    When getPatch is called
    Then it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "diff via api", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """

  Scenario: falls back to cloning when the diff endpoint fails
    Given a github client
    And the pull diff endpoint fails with "diff endpoint failed"
    And the pull json endpoint replies with shas "basesha" and "headsha"
    And the repo is public
    And the git toolchain produces diff:
      """
      cloned diff content
      """
    When getPatch is called
    Then it resolves to:
      """
      {"repo": "pull-merge", "owner": "brave", "type": "simple", "body": "cloned diff content", "watermark": "[[puLL-Merge](https://github.com/brave/pull-merge)] - [brave/pull-merge@42](https://github.com/brave/pull-merge/pull/42)"}
      """
    And the error "diff endpoint failed" was logged
    And gh cloned "brave/pull-merge" and git diffed "basesha" and "headsha"
    And the clone directory was removed
    And 3 github requests were made

  Scenario: env-only tokens never construct a client
    The GITHUB_TOKEN fallback is read after the Octokit construction
    check, so a token that arrives only through the environment leaves
    the github client null and the API path crashes with a TypeError
    instead of authenticating. This documents that latent bug.
    Given the environment variable GITHUB_TOKEN is "env-tok"
    When getPatch is called
    Then it rejects with a TypeError

  @property
  Scenario: public fetch round-trip property
    For any owner, repo, PR number and diff body the anonymous path
    preserves the body exactly and builds the standard watermark.
    When the public fetch round-trip property holds for 25 runs

  @property
  Scenario: github round-trip property
    For any owner, repo, PR number and diff body the API path preserves
    the body exactly and builds the standard watermark.
    When the github round-trip property holds for 25 runs
