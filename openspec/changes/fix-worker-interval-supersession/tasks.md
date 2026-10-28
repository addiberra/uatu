# Tasks

## 1. Historical supersession correction

- [x] 1.1 Add provider-level regressions for all three-launch content permutations and combined/split assistants with pending reports; verify the reproduced newer / older / newer-alias case fails before implementation, then check exact two-occurrence result mapping, stable tool order and read-only API use.
- [x] 1.2 Fence historical supersession using proven interval separation while preserving ambiguous and live behavior; verify the new regression matrix and existing missing/tied-clock, delayed-old-result and no-explicit-report cases pass, and rerun the original reviewer probe.
- [x] 1.3 Align `ARCHITECTURE.md` with the implemented historical boundary and inspect its claims against the positive and negative tests.
- [x] 1.4 Clarify the accepted initial retrospective-record deviation and subsequent prospective planning in the two archived proposals; verify the text preserves truthful chronology and grants no future waiver.
- [x] 1.5 Add permission-delayed admission regressions before correcting historical grouping/report selection; verify calls at 13/15 spanning idle 17 with acceptance at 16/23 cannot let result 18 settle the later generation, for running and completed later work and ambiguous/missing clocks.
- [x] 1.6 Bound historical occurrence proof by reliable launcher admission evidence and align architecture documentation; verify new regressions, original interleaved-history probes, existing alias/result safety cases and the reviewer delayed-admission probe pass without inventing correlation for ambiguous evidence.
- [x] 1.7 Add failed-first-inventory then transcript-read regressions for removed and still-running targets before correcting cross-caller admission; verify transcript-only reads cannot grant missing proof while healthy sibling controls survive and fresh valid recovery succeeds.
- [x] 1.8 Preserve outstanding fresh-verification requirements across read callers and align architecture documentation; verify the reviewer inventory probe and existing inventory retry, retained-control, gap, ownership, revocation and capacity tests pass within existing evidence budgets.

## 2. Integration and independent review loop

- [x] 2.1 Run provider, background/control and normalization suites, `bun run typecheck`, `bun run audit`, `bun run check:licenses`, build, smoke, strict OpenSpec validation and diff checks; record actual commands/results and disclose any verification limits.
- [x] 2.2 Run the full unit suite and distinguish introduced failures from the two already reproduced baseline failures without modifying unrelated tests.
- [x] 2.3 Run fresh independent standards and spec/correctness reviews of the complete PR against `512290b5a6dbe1e6944b7deea4e341c651c34dbe`; reproduce and correct actionable findings, renewing affected verification/review until both fresh reports have no unresolved actionable findings.
- [x] 2.4 Reconcile task/review records and inspect the full publication diff for secrets or unrelated changes before committing.
- [x] 2.5 Present the updated PR description for approval, publish verified corrections to #559 while preserving ready-for-review status, and verify new-head CI, including the full `bun run test:e2e` coverage split across both browser legs and performance job; use CI as the final full-suite gate per `CONTRIBUTING.md`, and report the precise remaining blocker if any check cannot complete.
- [x] 2.6 Restore this change to its active path while #559 remains open; preserve completed implementation and verification evidence, and verify OpenSpec discovers the active change and strict validation passes.

Keep this change active while #559 is open. Archival belongs to the repository's normal finalization workflow, not completion of the review loop.

## Verification evidence

- Round 1 reproduced and corrected historical supersession across interleaved intervals; documented the user-accepted one-time initial planning deviation without claiming retroactive compliance.
- Round 2 reproduced and corrected permission-delayed admission miscorrelation and transcript-only admission after incomplete inventory. Each corrective expansion was planned before implementation, with red regressions first.
- Round 3 fresh, independent native Luna/high standards and Sol/high spec/correctness reviews reported no actionable findings on the complete PR and current corrections. These are review results, not a proof of bug-freedom.
- `bun test src/chat/opencode/v2/provider.test.ts`: 1,512 passed. `bun test src/chat/opencode/v2/background.test.ts src/chat/opencode/v2/normalization.test.ts`: 186 passed. Shared normalization: two passed. The PR adds 114 regression/safety cases in total.
- Independent review executed 112 focused repository tests, all 720 six-launch/three-interval content permutations, and twelve additional admission-window safety cases. Real-provider synthetic stubs assert read-only requests; captured original-history replay also passed.
- `bun run test:ci`: 7,281 passed, 16 skipped, two unchanged failures previously reproduced on baseline: the 150 ms backend startup-progress test and the state-dir unsafe-mode fixture under inherited umask `077`. An earlier round also timed out the hub chat-retry test; the entire hub file then passed 80/80 in isolation, and that timeout did not recur in the final full-suite run. No unrelated test was modified.
- Typecheck, build, compiled-binary/browser smoke, license audit (597 installed packages), all 61 strict OpenSpec checks, and diff checks passed. Dependency audit passed its moderate-or-higher gate while disclosing existing low-severity KaTeX advisory GHSA-238p-pmpm-9mq7.
- Local checks used installed Bun 1.4.2; no runtime or dependency was installed. Correction `04e3a5c` was pushed to #559 and [CI run 40616093739](https://github.com/tjakobsson/uatu/actions/runs/40616093739) passed, including unit, both functional browser legs, performance, both contract jobs, strict spec validation and final validation; CodeQL also passed. The approved PR-description correction reports the observed successful result, not an unfinished run. Ready-for-review status is preserved. Independent provider checks used scripted stubs, not live-provider execution. Neither running hub was upgraded or restarted.
- The reviewer's initial two-completed-generation probe demanded an unproved exact mapping; the reviewer confirmed that assertion was overstrict. The permanent safety matrix instead requires uncertain unproved assignments and readable, deduplicated explicit results. Notification-first multi-alias reachability remains unestablished and is not claimed fixed.
