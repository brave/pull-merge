Feature: CLI harness
  run.js loads a module by path and invokes its default export with the
  parsed command-line values, printing the result.

  Scenario: running a module with flag arguments
    When run.js executes "./test/fixtures/hello-module.mjs" with args "--name=world"
    Then it exits with code 0
    And it prints "hello world"

  Scenario: running a module without flag arguments
    When run.js executes "./test/fixtures/hello-module.mjs" with args ""
    Then it exits with code 0
    And it prints "hello stranger"

  Scenario: failing when no module is given
    When run.js executes "" with args ""
    Then it exits with a non-zero code
