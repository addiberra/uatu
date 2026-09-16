## Why

The workspace file tree reopens a manually collapsed folder when its selected file is updated or an unrelated file is added, even with Follow off. Background refreshes currently reveal the already-selected document again, overriding the user's folder layout instead of preserving it.

## What Changes

- Distinguish background tree refreshes from changes to the active document. In the All view, unchanged selection must not reopen collapsed ancestors during content updates or path-set rebuilds.
- Preserve surviving folders' open/closed state when files are added, removed, or renamed without changing the active document.
- Keep additive ancestor reveal for initial selection and genuine selection changes, including Follow-driven navigation; keep selection synchronization independent of expansion.
- Clarify that the tree library owns expansion state and rendering, while uatu may use its public APIs to preserve state and reveal a newly selected document.
- Retain the browser reproductions as regression tests and replace the existing fixed refresh delay with an observable completion signal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tree`: Clarify that background refreshes with unchanged selection preserve manually collapsed ancestors in the All view, including path-set rebuilds, and distinguish library-owned state from application-directed reveal.

## Impact

- Primary implementation: `src/sidebar/tree-view.ts`, including expansion inputs to `resetPaths` and the unconditional refresh-time `revealAndSelect` call.
- Verification: `tests/e2e/document-tree.e2e.ts`, relevant tree unit tests, and existing Follow, manual-selection, and Files-filter browser coverage.
- No API, server protocol, dependency, storage, or desktop-native changes are expected.
- Non-goals: persistence across page reloads, changing Follow navigation rules, redesigning Changed-filter expansion or filter transitions, and unrelated tree-state or virtualization issues.
