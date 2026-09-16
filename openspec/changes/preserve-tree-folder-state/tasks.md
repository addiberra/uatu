## 1. Establish regression coverage

- [x] 1.1 Review the carried-over reproduction tests and rerun `bun run test:e2e tests/e2e/document-tree.e2e.ts --grep 'user-expanded|user-collapsed' --workers=1`; verify both collapsed-ancestor cases fail on current product code and both expanded-folder controls pass.
- [x] 1.2 Extend the browser cases to assert simultaneous open/closed folder preservation, stable preview identity and Follow state, and selected-file state after manually reopening the ancestor; verify the new assertions observe the real tree after an explicit refresh-completion signal.
- [x] 1.3 Add unrelated removal and rename cases plus a Follow-on same-document update case; run the focused tests before the fix and confirm failures reflect changed folder state rather than watcher/setup timeouts.

## 2. Correct refresh and reveal behavior

- [x] 2.1 Separate selection synchronization from ancestor reveal in `src/sidebar/tree-view.ts`, track the last represented application selection, and reset that bookkeeping on disposal or explicit selection clearing; verify content-only refresh preserves a collapsed ancestor while initial-selection, changed-selection, and clear-then-reselect tests pass (use a direct adapter test for lifecycle inputs not reachable through normal UI).
- [x] 2.2 Use the same reveal decision when composing All-to-All `resetPaths` expansion inputs, preserving the library's surviving expanded paths without re-adding unchanged-selection ancestors. Restore collapsed ancestors implicitly reopened by the library's expanded-descendant initialization through public APIs; verify addition, removal, and rename regressions pass with both open and closed directories preserved, including expanded descendants beneath collapsed ancestors.
- [x] 2.3 Preserve the programmatic-selection guard, unavailable-selection recovery, and existing filter-specific policy. Reconcile directory-selection callbacks to the currently available active file without revealing it or moving keyboard focus; verify a returning previously represented same-path selection preserves surviving collapsed ancestors, a different selection first becoming available reveals and selects its row, cleared/unavailable selections are not resurrected by directory clicks, and real pointer/keyboard navigation still works after refresh.

## 3. Verify integration and record results

- [x] 3.1 Run `bun run test:e2e tests/e2e/document-tree.e2e.ts tests/e2e/follow-mode.e2e.ts tests/e2e/manual-selection.e2e.ts tests/e2e/files-pane-filter.e2e.ts --workers=1`; verify all pass, including initial nested reveal, Follow-driven switches, manual navigation, and filter snapshot restoration.
- [x] 3.2 Run `bun test src/sidebar/tree-view.test.ts` and `bun run typecheck`; verify both pass and add colocated tests if the implementation introduces pure decision logic.
- [x] 3.3 Record actual commands, results, and remaining limitations in the change's validation notes, then run `bunx --no-install openspec validate preserve-tree-folder-state --strict` and `git diff --check`; verify valid artifacts and no leftover diagnostic edits before declaring implementation complete.
