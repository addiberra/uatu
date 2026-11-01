# preview-file-navigation Specification

## Purpose
Browse scoped sibling files from touch Preview without rebuilding workspace surfaces.

## Requirements

### Requirement: Persistent touch Preview controls
Touch Preview SHALL expose a translucent Files/Previous/Next pill, including while workspace navigation is collapsed. It SHALL default to the left and support a right-side device preference through workspace navigation controls only. It SHALL clear the selector's measured bounds during expansion and dismissal, respect safe areas and the visual viewport, and reserve no document gutter. It SHALL be absent from other tabs and desktop mode.

#### Scenario: Back to Files
- **WHEN** the user activates Files
- **THEN** the existing Files surface is revealed with selection, Follow, compare target, filter, and tree expansion preserved

### Requirement: Exact-root scoped siblings
Previous/Next SHALL use indexed files in the current stable root and exact parent directory within the effective client scope. The order SHALL match Files: dot-prefixed names first, then case-insensitive alphabetical order with deterministic ties. Directories and descendants SHALL be excluded, traversal SHALL not wrap, and unknown or ambiguous identity SHALL not be guessed. Changed SHALL remain a presentation filter, not sibling scope. File pins and single-file launches SHALL not widen.

#### Scenario: Duplicate paths in different roots
- **WHEN** two roots contain the same relative image path
- **THEN** navigation and image loading use the selected root's exact indexed identity

### Requirement: Normal user-selection semantics
Successful steps SHALL use the existing user-selection path, disable Follow, reveal Preview, update tree/history, and preserve compare target and unrelated preferences. Image, text, rendered-document, diff and unsupported-binary behavior SHALL remain owned by existing renderers. Encoded filenames, fragments and recorded document identities SHALL survive browser history. Late loads SHALL not replace a newer selection or scope. The additive internal image-resource route SHALL reuse the existing image allowlist, ignore rules and realpath containment, without changing the public Hub API.

#### Scenario: In-page state survives
- **WHEN** the user steps through files and returns to Chat or Terminal
- **THEN** the same conversation draft and attached PTY remain

### Requirement: Boundaries and failures are distinct
A fresh single-file sibling set SHALL hide both arrows. Multi-file boundaries SHALL retain the unavailable arrow with disabled semantics and an accurate first/last description. Empty, commit and other non-file previews SHALL retain Files without arrows. Loading index, failed index, pending selection, timeout, load failure and missing target SHALL remain distinguishable from sequence boundaries. Files SHALL remain usable, and meaningful failures SHALL expose explicit Retry. Retry SHALL revalidate the intended identity and scope, never silently substitute another file.

The ten-second presentation deadline SHALL apply only while touch mode can expose its recovery controls. Leaving touch during a pending load SHALL cancel the deadline without invalidating that load; entering touch SHALL start a fresh deadline. Leaving touch after a timeout SHALL retry the selected identity through its existing load owner rather than hide its only recovery. Desktop delivery SHALL retain its existing loading behavior, including successful responses arriving after ten seconds.

#### Scenario: Timeout and removal
- **WHEN** a selected destination times out and is then removed before Retry
- **THEN** recovery reports the missing target without choosing a replacement or reloading the workspace
