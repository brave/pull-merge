# Test suite

BDD (cucumber-js) + property-based (fast-check) tests for the pull-merge
GitHub Action. Mocks are provided by quibble ESM interception plus PATH
shims (`test/bin`) and a hermetic `fetch`.

## Running

    pnpm install
    pnpm run test             # full suite with c8 coverage report
    pnpm run test:bdd         # cucumber only, no coverage
    pnpm run test:coverage    # strict gate: >=80% lines/statements/functions/branches

CI runs `pnpm run test` after lint on Node 22.x and 24.x.

## Layout

- `test/features/*.feature` — Gherkin scenarios (one file per src module)
- `test/steps/*.mjs` — step definitions; src modules are imported lazily
  inside step bodies so quibble mocks are registered first
- `test/support/` — world/state, quibble mock registrations, fake
  github/fetch/fs, CLI shims for `filterdiff`, `gh`, `git`
- `test/fixtures/` — helper modules for the `run.js` CLI harness tests

Support file order matters: `state.mjs` → `mocks.mjs` (quibble, top-level
await) → `world.mjs` → steps. See `cucumber.cjs`.

## Symbolic execution

Per the original test plan, symbolic execution was attempted as a spike
(ExpoSE) with property-based testing as the documented fallback:

- ExpoSE (github.com/ExpoSEJS/ExpoSE) requires an exact Node v21.7.2
  runtime and a source build via a deprecated Babel 6 toolchain. The
  build no longer completes on a current toolchain: the babel 6 CLI
  pipeline is unmaintained, the Analyser bundle step fails on ESM
  `import`/`export` syntax, and this repository is pure ESM, which the
  Jalangi-style analyser does not load.
- Verdict: symbolic execution is not feasible here. The property-based
  fallback (fast-check scenarios tagged `@property` in the feature
  files) covers the pure logic instead: text shaping in `utils.js`,
  filterdiff echo identity, config/property merging, debounce
  boundaries, bot patch parsing, model version ordering, and prompt
  embedding for all three explain backends.
- The property scenarios run as part of the normal suite and the strict
  coverage gate; no extra tooling is required.

## Known gaps

The strict gate allows the two model-update scripts to keep their CLI
guard branch uncovered: `if (import.meta.url === pathToFileURL(...))`
can only be true in a real CLI process, not under cucumber. Dead error
branches that are structurally unreachable (e.g. `!defaultModel` after
the fetch already threw) are likewise excluded.
