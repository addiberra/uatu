# Production geometry and contextual safety correction — 2026-10-16

**Source-only correction; not deployed or user-accepted.**
The live executable remains `473514d`. No service, route, installed dependency,
configuration or authentication policy was changed by this correction.
The lead reports independent approval of the seven code/test files, 53 focused
checks, typechecks and inspected images; the final provenance reconciliation
below addresses the review's separator-space observation.

## Finding and correction

The lead's image inspection of the deployed dashboard/Settings comparison caught
real design defects, not approved fidelity exceptions. This record supersedes
the geometry, broken metadata wrapping and overview safety-layout caveats in
[the deployment packet](deployment-verification.md) **for corrected source only**.
The packet's original observations, checks and historical limitations remain.

The first production-browser regression was run before the fix and failed:

```sh
bunx playwright test -c playwright.mobile-live.config.ts tests/e2e/mobile-live-geometry.e2e.ts --project=mobile-live-chromium
```

| Measurement at 390×844 | Before: direct Hub | Before: retained workspace | Corrected target |
| --- | --- | --- | --- |
| Overview main padding | `20px 16px 128px` | `0px` | `0px` in either host |
| Heading line-box origin | `(36,85)` | `(20,65)` | `(20,65)`; visible glyphs around y=72 |
| Card x / width | `36 / 318px` | `20 / 350px` | `20 / 350px` |
| Overview safety explanation | Always expanded; 396px | Always expanded; 309px | Concise notice and closed, labelled native disclosure |

The actual matched cascade identified legacy `main` rules in `pages.ts` and
`mobile-presentation.ts`. `.mh-page` already supplies the intended outer spacing
and bottom clearance. A scoped `.mh-root .mh-page > main` rule now owns all four
affected properties: padding, margin, maximum width and positioning. Desktop's
legacy main is untouched. The extra dashboard vertical shift was also caused by
the unnecessarily narrow hostname/session subtitle wrapping, not a second heading
font defect. Heading type already matched across hosts.

Cascade inspection additionally found different host defaults for `summary`
type and safety `h2` margins. These now have explicit mobile-scoped typography.
The full safety heading uses the body role, rather than an unstyled 25.5px h2.

The Running label was genuinely splitting into “Runnin” / “g” and an orphan
separator even at 390px. Runtime and branch metadata are now semantic flex items:
Running stays whole; branch metadata can move to another line without clipping
or losing its full text. Long real paths remain wrapped rather than truncated.

## Safety information remains available

Only the Settings overview uses the compact presentation. The notice explicitly
says credentials are shared across workspaces. Its per-user dismissal uses the
existing storage key and in-memory fallback. “Credential safety details” remains
a keyboard-operable native disclosure after dismissal and after reload.

The disclosure retains the exact assignment-defaults/non-isolation explanation,
same-UID runtime-file/shared-agent/configuration/other-assignment facts, untrusted
project warning, provider-token stop consequence and shell-stop requirement.
Credential details, credential creation, assignment and clone flows still use
the complete contextual explanation, including after overview dismissal.
Expansion and summary focus survive overview refresh; dismissal explicitly
focuses the persistent summary in Chromium and WebKit.

## Verification and evidence

No reference image, golden, existing assertion or meaningful test was replaced.

| Check | Result / local evidence |
| --- | --- |
| Final complete `playwright.mobile-live.config.ts` production suite | **88/88 passed**, Chromium/WebKit, including all **12 geometry cases**; `.local/geometry-production-final.log` and `.local/geometry-final/` |
| Earlier focused `mobile-live-geometry.e2e.ts` rerun | **12/12 passed** before the final textual separator; `.local/geometry-final-matrix.log`, superseded by the final full-suite run above |
| Focused mobile, legacy presentation/pages, evidence/privacy/hosting units | **467 passed, 0 failed, 4,338 assertions**; `.local/geometry-focused-units.log` |
| `bun run typecheck` and targeted strict check of both E2E entries | Passed; `.local/geometry-{typecheck,e2e-typecheck}.log` |
| `bun tests/mobile-hub-review/compatibility.ts` | **4/4** standalone desktop/touch cases passed, both engines; `.local/geometry-standalone.log` |
| `bun tests/mobile-hub-review/isolation-interiors.ts` | Current standalone/integrated Preview structure/styles/geometry/pixels matched in both engines; `.local/geometry-interior-isolation.log` |
| Strict OpenSpec validation and `git diff --check` | Passed |

The final complete suite ran **after** the last product edit: one separating
space between the Running and branch spans, also covered by a literal text unit
assertion. No code changed after that run. Its 12 geometry cases include the
isolated control, settled account content, last-control hit-testing and visible
final safety facts. These counts are **not 100 distinct cases**. The responsive cases cover 390×844
dark, 320×568 dark, 844×390 dark and 140% scoped mobile text roles, through direct
and retained entry. They verify whole Running labels, contained cards, numeric
geometry equality, native disclosure keyboard/dismiss/reload behavior, reachable
final safety facts above the dock, loaded Agent accounts and Notifications with
their last controls hit-testable after scrolling. They also retain workspace DOM
identity and full credential/assignment/clone safety context.

Desktop cases assert the existing 680px main, 40/20/64px padding, no mobile root,
and 72px native-titlebar inset behavior on dashboard, Settings and clone. Desktop
screenshots contain asynchronous account checking and do not claim historical
pixel identity. The Preview isolation check compares two **current** entries;
it does not manufacture the missing historical four-interior comparison.

Primary local artifacts (ignored, not publication-safe image uploads):

- `.local/geometry-before/`: pre-fix production screenshots, exact geometry and
  matched-cascade captures; `.local/geometry-red.log` records the red regression.
- `.local/geometry-final/`: **146** final PNG captures plus JSON geometry/cascade
  evidence. `geometry.json` in each light case compares isolated/direct/retained.
  This is the final full-suite output, renamed from its run-time output directory
  `.local/geometry-production-final/` for a stable handoff path.
- `.local/geometry-visual/before-after-{hub,settings}.png`: canonical refined
  reference, pre-fix production source, corrected production source. Reference
  images are normalized from DPR 2; fixtures intentionally differ from reference
  identities, credential presence and workspace counts. Disposable paths differ
  between before/after runs, so these are visual comparisons, not pixel goldens.
- `.local/geometry-visual/manifest.json`: exact source SHA-256s, case-to-directory
  mapping and per-capture hashes; overview/detail/desktop contact sheets sit beside
  it. Representative light/dark, narrow/short, landscape, enlarged-text, expanded
  safety, scrolled final facts/controls and desktop images were opened with the
  image reader, including full-size narrow examples. This is self-inspection,
  not independent visual approval of all captures.

Exact final source SHA-256 for `src/hub/mobile/frontend.ts`:
`a34b6c0de9f8b732625da9bd463249b66436803412c7a6d696435ece1975f829`.
The earlier manifest's `57905e19…` identified the pre-separator source; it is not
claimed as verification of the final bytes. The refreshed manifest and
`.local/geometry-visual/final-source-verification.json` match the final files and
staged Git blobs, including all screenshot hashes. Final evidence supersedes
the earlier manifest mismatch rather than treating a one-space edit as tested
without rerunning it.

Visual reading confirmed aligned 20px heading/card edges, the corrected heading
height, whole status labels, the short non-yellow overview notice and an obvious
disclosure. Short views intentionally scroll under the floating dock; the
scrolled final-fact/control captures and hit tests establish reachability rather
than treating an initially covered row as a pass by itself.

Intermediate evidence is retained honestly: the first WebKit run found that
clicking Dismiss does not necessarily focus its button; explicit focus transfer
fixed that. An early compactness assertion measured a closed disclosure body's
WebKit layout rectangle; it now measures the visible disclosure footprint and
checks heading visibility. The first isolated control omitted the required Hub
metadata and the real transport correctly refused its reads; the test document was corrected,
without bypassing the guard. Early account captures caught loading, so the final
suite waits for loaded scope text/Refresh before capture. No assertion was waived.

The new geometry test exercises production direct/retained documents and assets
against the same disposable real CLI Hub and workspace fixtures. An isolated
renderer control uses the shipping frontend/live backend with only its own CSS,
against those same APIs; it is explicitly not another production entry path.
It asserts intended numeric geometry, compares hosts, and emits screenshots and
matched-cascade evidence without nondeterministic golden approval.

The prior responsive archive's style hash belongs to its earlier source, not this
correction. Its historical results are not silently inherited as a new run.

Physical-device, native WebView/safe-area/keyboard, final human visual acceptance,
the earlier archive-digest discrepancy and missing exact historical interior
comparisons remain separate open gates. Scoped text stress is not OS Dynamic
Type. Self-review is not independent validation.
