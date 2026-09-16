## Context

See `proposal.md` for motivation and `specs/document-tree/spec.md` for the behavior contract.

Accepted document live frames reach `renderSidebar()` through `src/shell/events.ts`, which invokes `TreeView.update()` through `src/sidebar/shell.ts` even if the active document is unchanged. The tree adapter currently:

1. Computes selected-file ancestors on every update.
2. Merges those ancestors with preserved expansions when a changed path set requires `resetPaths`.
3. Calls `revealAndSelect()` unconditionally for any selected document, expanding its ancestors again even without a path reset.

The library already supplies the expansion state needed for rebuilds. The missing distinction is between synchronizing selection and revealing a newly active document.

### Diagnosis evidence

The existing workspace changes in `tests/e2e/document-tree.e2e.ts` include three new reproductions and replace an older fixed 500 ms wait with a preview-content assertion. Against unchanged product code, this command repeatedly returned two passes and two failures:

```sh
bun run test:e2e tests/e2e/document-tree.e2e.ts --grep 'user-expanded|user-collapsed' --workers=1
```

| Case | Current result |
| --- | --- |
| Expanded unrelated folder, content update | Pass |
| Expanded unrelated folder, file addition | Pass |
| Collapsed selected-file ancestor, selected-file update | Fails: folder reopens |
| Collapsed selected-file ancestor, unrelated addition | Fails: folder reopens |

Temporarily removing refresh-time `revealAndSelect()` made the content-update case pass but left the addition failing. Also removing forced ancestor expansion from reset inputs made all four pass. Those diagnostic edits were reverted: they establish causality, not a production-ready fix. Removal/rename cases, Follow-on same-document updates, and Changed-filter behavior have not yet been verified by these reproductions.

## Goals / Non-Goals

**Goals:**
- Keep the correction inside the tree adapter where refresh, selection, and expansion already meet.
- Separate selection synchronization from the decision to reveal ancestors.
- Read current expansion from the library rather than introduce a second folder-state model.

**Non-Goals:**
- Changing document identity, server event payloads, URL behavior, or Follow rules.
- Persistent browser storage for folder state.
- Redesigning filter transitions or repairing separate Changed-mode expansion issues.

## Decisions

### 1. Remember the last active document presented to the tree

Track the last application-selected document identity and resolved tree path successfully represented by the adapter. Compare the new identity/path before overwriting that state. Initial mount and a changed selection request reveal; an unchanged selection during an All-to-All update does not. Temporary absence must not erase the last represented selection: restoring the same document at the same path synchronizes selection without reopening surviving collapsed ancestors, whereas a different selected document becoming representable for the first time receives reveal. Clear this bookkeeping on disposal and when the application explicitly clears selection.

Do not use `getSelectedPaths()` alone to infer navigation: user input and path rebuilds can mutate library selection before the application update arrives. Similarly, Follow being enabled is not itself a reveal request; only a resulting change of active document is.

Alternative rejected: suppress every refresh-time reveal. The diagnostic experiment used this, but it breaks genuine selection changes after first mount.

### 2. Synchronize selected rows without necessarily expanding ancestors

Separate the current `revealAndSelect` responsibilities, either with a clearly named reveal option or two internal operations. Always reconcile selected rows through the existing programmatic-update guard. Expand ancestors only when the reveal decision requires it. This preserves the active file's selection after a rebuild even if its row is hidden under a collapsed ancestor, and avoids leaving the directory itself selected after a collapse click.

Alternative rejected: skip the whole selection operation when the active document is unchanged. A rebuild or folder interaction may have changed library selection, so skipping synchronization can preserve expansion at the cost of incorrect selected rows.

### 3. Apply the same reveal decision to reset inputs

For All-to-All path-set changes, snapshot the library's currently expanded directories before resetting. Restore surviving expanded directories and union in selected-file ancestors only if a reveal is required. With unchanged selection, the expanded snapshot alone determines existing directory state; collapsed directories remain absent from it, and new unrelated directories use the closed default.

Use the same decision for both initial expansion inputs and post-reset selection handling. Fixing only one of these paths leaves one of the confirmed failures intact. Keep the existing path fingerprint optimization; avoiding redundant resets alone cannot fix content-only updates.

Filter initialization and All/Changed transitions retain their separate existing expansion policy. Do not change the meaning of `reconcileFilterExpansion`, the full-tree filter snapshot, or Changed-mode automatic ancestor expansion as part of this correction.

Alternative rejected: continuously track every folder toggle in application state. The library already owns this state, and a second model adds reconciliation and lifecycle risk.

### 4. Preserve the real browser reproduction as the acceptance seam

The regression must exercise real folder clicks, the file watcher/live refresh, and the actual tree library. Pure ancestor-list helper tests cannot catch the unconditional reveal call or lost selection after a rebuild. Extend the reproductions to assert selected-row state after manually reopening a folder, stable Follow/preview identity, unrelated removal/rename, and a Follow-on refresh that retains the same document. Retain existing initial-selection and Follow-switch tests as positive reveal controls.

Wait for observable completion (new row present, removed row absent, updated preview content), not a fixed sleep. Use the library's existing model access hook where virtualization prevents a reliable row-presence assertion.

## Risks / Trade-offs

- **Over-suppressing reveal hides genuinely new selection** → Compare application identity/resolved path and verify initial nested selection, manual navigation, Follow navigation, and unavailable-selection recovery.
- **Restoring expansion but losing selected rows** → Keep selection synchronization unconditional and assert the active file remains selected when its ancestor is reopened.
- **Changed-filter behavior regresses through shared reset code** → Limit the new preservation branch to All-to-All refreshes and run the existing filter suite without redesigning its policy.
- **Asynchronous refresh makes tests pass too early** → Wait for evidence that the specific filesystem change reached the UI before checking folder state.
- **Existing spec language forbids custom expansion handling despite requiring preservation/reveal** → Clarify that public-API orchestration and boundary snapshots are allowed, while the library remains the owner of current state and DOM.

## Migration Plan

No data or API migration is required. Ship as a client-side adapter correction after the focused and related regression suites pass. Reverting the adapter change restores previous behavior without storage cleanup. Before preparing a fix PR, check the latest stable release for the broken behavior and follow the repository's release-note override rules if it is unreleased-only.
