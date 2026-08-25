Feature: filterdiff runs the patchutils binary
  Business rule: the external filterdiff CLI always receives --strip=1
  plus exclude args; the patch travels over stdin and the filtered
  stdout becomes the result. Any stderr output fails the run.

  Background:
    Given the filterdiff shim records its invocation to a state file

  Scenario: default excludes are applied when no args are given
    When filterdiff is called with content "diff --git a/x b/x"
    Then the shim received argv "--strip=1 --exclude=**/package-lock.json --exclude=**/pnpm-lock.yaml --exclude=**/yarn.lock --exclude=**/*.js.map"
    And the shim received stdin "diff --git a/x b/x"
    And filterdiff resolves to the echoed content

  Scenario: args given as a space separated string are split
    When filterdiff is called with content "p" and args string "  --exclude=**/a.lock   --exclude=**/b.lock  "
    Then the shim received argv "--strip=1 --exclude=**/a.lock --exclude=**/b.lock"

  Scenario: args given as an array are passed through untouched
    When filterdiff is called with content "p" and args array "--exclude=**/a.lock,--exclude=**/b.lock"
    Then the shim received argv "--strip=1 --exclude=**/a.lock --exclude=**/b.lock"

  Scenario: empty args array leaves only the strip flag
    When filterdiff is called with content "p" and args array ""
    Then the shim received argv "--strip=1"

  Scenario: debug logs the assembled command line
    When filterdiff is called with content "p" and args string "--exclude=**/a.lock" and debug on
    Then "filterdiff --strip=1 --exclude=**/a.lock" was logged

  Scenario: stderr from the binary fails the run
    Given the filterdiff shim writes "filterdiff: unsupported option" to stderr
    When filterdiff is called with content "p"
    Then filterdiff rejects with "filterdiff: unsupported option"

  Scenario: transformed stdout is returned verbatim
    Given the filterdiff shim outputs "filtered patch body"
    When filterdiff is called with content "raw patch body"
    Then filterdiff resolves to "filtered patch body"

  @property
  Scenario: echo shim is a byte preserving identity
    When the filterdiff echo identity property holds for 100 runs
