## MODIFIED Requirements

### Requirement: Preserve manual directory open/closed state in the document tree
Directories in the sidebar tree SHALL render collapsed (closed) by default, matching the conventions of common file trees (VS Code, Finder, GitHub). When a user expands or collapses a directory, that explicit choice SHALL persist across document selections and across sidebar re-renders triggered by file changes — including filesystem-driven `resetPaths` calls into the library — except for ancestors required to reveal a newly active document. When the active document changes (initial default, follow-mode auto-switch, or user click), the system SHALL reveal the path to that document by expanding every ancestor directory between the watched root and the document, then marking that document's row as selected. The reveal MUST be purely additive — it opens ancestors but never closes any directory the user has opened. In the All view, a background refresh that leaves the active document unchanged MUST preserve the open/closed state of surviving directories, including manually collapsed ancestors of the active document; refreshing its content or rebuilding the file list MUST NOT itself request a new reveal. The active document SHALL remain selected even when its row is hidden by a manually collapsed ancestor. This background-refresh rule applies whether Follow is on or off, provided it does not change the active document. The separate Changed-filter auto-expansion and filter-transition requirements remain unchanged. The session-level expansion state MAY reset on page reload.

A new selection that cannot yet be represented in the tree SHALL receive its pending reveal when it first becomes available; this completes the selection change rather than treating it as an unchanged-selection background refresh. A previously represented selection returning at the same path after temporary absence SHALL synchronize selection without a new reveal. Explicitly clearing selection and subsequently selecting the same document SHALL count as a new selection.

#### Scenario: Directories start collapsed
- **WHEN** the document tree is first rendered and the default document is at a watched root with no ancestor directories
- **THEN** nested directories render collapsed and only top-level documents are visible until the user expands a directory

#### Scenario: Initial selection inside a nested directory is revealed on first paint
- **WHEN** the SPA boots with an initial selected document inside a nested directory (e.g. follow-mode was on and the latest file is in `guides/`)
- **THEN** the tree renders with every ancestor directory of that document expanded
- **AND** the row for that document is rendered as selected

#### Scenario: Follow-mode auto-switch reveals the path to the newly active document
- **WHEN** follow mode is enabled and a different file inside a nested directory changes on disk
- **THEN** the preview switches to that file
- **AND** every ancestor directory from the watched root down to the file renders as expanded
- **AND** the row for the previously-selected document is no longer rendered as selected
- **AND** the row for the newly-selected document is rendered as selected

#### Scenario: Reveal is purely additive — it never closes anything
- **WHEN** the active document changes (initial default, follow-mode auto-switch, or user click)
- **THEN** directories the user has expanded remain expanded
- **AND** only the new document's ancestor directories are added to the expanded set

#### Scenario: A manually expanded directory stays expanded across file selections
- **WHEN** a user expands a directory by clicking its row
- **AND** then selects a different file in the tree
- **THEN** the directory remains expanded

#### Scenario: Manual expansion state survives sidebar re-renders driven by file changes
- **WHEN** a user expands a directory and an unrelated file is modified on disk, triggering a sidebar re-render
- **THEN** the directory remains expanded
- **AND** any directories that are newly required by reveal (because the selection changed) are added to the expanded set on top of the user's choices

#### Scenario: Updating the active file does not reopen its manually collapsed ancestor
- **GIVEN** the Files-pane filter is All and Follow is off
- **AND** the user selected `guides/setup.md` and then collapsed `guides/`
- **WHEN** `guides/setup.md` is modified and the refresh is applied
- **THEN** its preview shows the updated content without changing the active document
- **AND** `guides/` remains collapsed
- **AND** manually expanding `guides/` reveals `guides/setup.md` as selected

#### Scenario: Adding an unrelated file preserves both open and closed directories
- **GIVEN** the Files-pane filter is All and Follow is off
- **AND** the user selected `guides/setup.md`, collapsed `guides/`, and expanded `metadata/`
- **WHEN** an unrelated file is added and appears in the refreshed file list
- **THEN** `guides/` remains collapsed and `metadata/` remains expanded
- **AND** the active document remains `guides/setup.md`

#### Scenario: Removing or renaming an unrelated file preserves surviving directories
- **GIVEN** the Files-pane filter is All and Follow is off
- **AND** the user has manually expanded some directories and collapsed an ancestor of the active document
- **WHEN** an unrelated file is removed or renamed and the refreshed file list reflects that change
- **THEN** every surviving directory retains its previous open/closed state
- **AND** the active document is unchanged

#### Scenario: A temporarily unavailable selection returns without a new reveal
- **GIVEN** the Files-pane filter is All and Follow is off
- **AND** the active document was represented in the tree before it became unavailable
- **AND** its manually collapsed ancestor remains present because it contains another file
- **WHEN** the same active document becomes available again at the same path
- **THEN** the ancestor remains collapsed
- **AND** the document is selected when the user manually reopens the ancestor

#### Scenario: Expanded descendants survive beneath a collapsed ancestor
- **GIVEN** the Files-pane filter is All and `guides/deep/` is expanded beneath manually collapsed `guides/`
- **WHEN** an unrelated file is added, removed, or renamed without changing the active document
- **THEN** `guides/` remains collapsed
- **AND** reopening `guides/` shows `guides/deep/` still expanded

#### Scenario: A new selection is revealed when it first becomes available
- **GIVEN** the Files-pane filter is All
- **AND** the application selected a different document while that document was unavailable
- **WHEN** that selected document first becomes available in the tree
- **THEN** its ancestors expand and its row is selected, completing the pending selection reveal
- **AND** other manually expanded directories stay expanded

#### Scenario: Reselecting a document after clearing selection requests a reveal
- **GIVEN** the active document's ancestor was manually collapsed
- **AND** the application explicitly cleared its active document selection
- **WHEN** the same document is selected again
- **THEN** its ancestors expand and its row is selected as a new selection

#### Scenario: Follow does not reveal again when the active document stays the same
- **GIVEN** the Files-pane filter is All and Follow is on
- **AND** the user collapsed an ancestor of the active document
- **WHEN** that document is updated and remains the active document after refresh
- **THEN** its preview refreshes and the ancestor remains collapsed
- **AND** Follow remains on

### Requirement: Render the document tree through `@pierre/trees`
The sidebar document tree SHALL be rendered by the [`@pierre/trees`](https://github.com/pierrecomputer/pierre/tree/main/packages/trees) library (vanilla entry). uatu MUST use the library's path-array input (`paths`) and selection API (`getSelectedPaths` / equivalent observer hook) as the public surface for the tree. uatu MUST NOT re-implement, replace, or mutate the library's row DOM, expansion handling, or keyboard navigation. Selection events from the library MUST drive the existing document-routing flow exactly as a sidebar tree click does today; manual selection MUST disable follow mode under the existing rules. The library SHALL remain the source of truth for current directory expansion state. Application-directed default expansion, state preservation across path rebuilds and filter transitions, and additive reveal SHALL use the library's public APIs to satisfy the directory-state and filter requirements; uatu MUST NOT maintain a competing continuously tracked open/closed-state model.

#### Scenario: Files pane renders the library's tree
- **WHEN** the `Files` pane renders for a folder-scoped session
- **THEN** the visible tree DOM is owned by `@pierre/trees`
- **AND** uatu does not emit its own `<ul>`/`<details>`/`<summary>` tree markup

#### Scenario: Selecting a clickable document loads its preview
- **WHEN** a user selects a non-binary document row in the tree
- **THEN** the library reports that path through its selection API
- **AND** the preview switches to that document
- **AND** follow mode is disabled in the same way as before the swap

#### Scenario: Tree state is fed by paths, not by hand-built nodes
- **WHEN** the watched-roots index changes and the tree must re-render
- **THEN** uatu feeds an updated `paths` array into the library
- **AND** uatu does not construct or pass internal node objects to the library
