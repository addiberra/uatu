# Validation — preserve-tree-folder-state

## Outcome

Implemented selection-aware reveal in the tree adapter. All-to-All refreshes
preserve surviving open and closed folders while keeping the active document
selected. Initial/new selections still reveal additively. Changed-filter
expansion policy is unchanged.

Two implementation discoveries were explicitly approved and added to the plan:

- `resetPaths` implicitly opens ancestors of expanded descendants. Public
  directory handles now restore the intended collapsed ancestors after reset,
  without discarding descendant expansion.
- Clicking a directory replaces the library's selected leaf. Directory callbacks
  now reconcile the currently available active-file selection without revealing
  it or changing keyboard focus. Cleared/unavailable selections are not revived.

## Commands and results

Run on 2026-09-16 using the installed dependencies and Playwright Chromium.

### Red baseline

```sh
bun run test:e2e tests/e2e/document-tree.e2e.ts --grep 'user-expanded|user-collapsed' --workers=1
```

- Original reproductions: **2 passed, 2 failed**, both failures caused by a
  collapsed selected-file ancestor reopening.
- Extended reproductions against unchanged product code: **2 passed, 5 failed**.
  Content update, addition, removal, rename, and Follow-on same-document update
  all reached their observable refresh-completion signal before failing on
  `aria-expanded`. These were not setup/watcher timeouts.
- Direct adapter tests against unchanged product code: **34 passed, 5 failed**
  using `bun test src/sidebar/tree-view.test.ts`. Failures covered unchanged and
  path-changing refreshes plus temporary absence with nested folder state.

### Intermediate diagnosis

After separating reveal from selection and restoring nested reset state, the
direct suite passed **39 tests**, but the focused browser run reported **3 passed,
4 failed** at the post-reopen selected-row assertion. A single-case rerun:

```sh
bun run test:e2e tests/e2e/document-tree.e2e.ts --grep 'a user-collapsed active folder stays collapsed when its file is updated'
```

confirmed the library selected `guides/setup.md` before the directory click and
`guides/` afterward. Diagnostic logging was removed. Additional direct and browser
tests caught this before directory-selection reconciliation was implemented.

### Final verification

```sh
bun run test:e2e tests/e2e/document-tree.e2e.ts --grep 'user-expanded|user-collapsed|pointer and keyboard' --workers=1
```

**8 passed**. Includes both expansion controls, all five collapsed-folder cases,
and pointer/keyboard navigation after refresh. Tests assert the real library's
selected paths before reopening and the selected row afterward; no fixed sleeps
were added for refresh completion.

```sh
bun run test:e2e tests/e2e/document-tree.e2e.ts tests/e2e/follow-mode.e2e.ts tests/e2e/manual-selection.e2e.ts tests/e2e/files-pane-filter.e2e.ts --workers=1
```

**51 passed** in approximately 1.7 minutes. Covers initial nested reveal,
Follow-driven switches, unchanged-document Follow updates, filter restoration,
manual navigation, and desktop/touch unavailable-selection recovery.

```sh
bun test src/sidebar/tree-view.test.ts
bun run typecheck
```

**42 unit tests passed**, **300 assertions**; typecheck passed. Direct adapter
tests use the real tree library with linkedom, including identity/path changes,
clear/reselect, disposal/remount, nested open/closed state, temporary absence,
pending reveal, selection callback guarding, and directory focus preservation.

```sh
bunx --no-install openspec validate preserve-tree-folder-state --strict
git diff --check
```

OpenSpec reported the change valid; whitespace validation passed. Final diff
inspection found no leftover diagnostic logging or temporary product edits.

## Limitations and observations

- The full repository unit suite and full E2E suite were not run; verification
  targets the suites required by this change. No additional browser engines or
  native desktop builds were tested.
- The E2E harness emitted `live upstream document subscription failed
  (unreachable)` warnings around workspace resets, including the passing runs.
  All required completion and behavior assertions passed.
- Folder state across page reloads and Changed-filter expansion redesign remain
  out of scope. No API, dependency, storage, or desktop-native changes were made.
- No diagnostic product edits or logging remain. No PR or archive was created.
  Stable-release classification remains a pre-PR task, as specified in the
  design's migration plan.
