# Current UI development and review package

Use this package to continue the unfinished UI update, not as an archive of every
capture run. **The reviewer remains simulation only; no real credentials.**
The user agreed the refined UI as the live phone target and explicitly authorized
integration on 2026-10-15; final version-specific visual/device acceptance is
still pending. See [the current decision](acceptance.md) and the
[live integration map](integration-map.md). Older no-authorization statements in
historical evidence do not override this decision; their results and limitations
remain unchanged. Planning does not change or restart either running service.

## What to use

- [Production geometry and contextual safety correction](geometry-correction.md):
  independently approved source now deployed as `80a2e3d`; fixes the spacing and
  Settings defects found by visual inspection. Final user acceptance remains open.

- [Current isolated live deployment and visual comparison packet](deployment-verification.md):
  frozen `80a2e3d`, corrected geometry/compact safety, real-backend checks, preserved OLD
  synthetic service and explicit remaining human/historical-baseline gates.

- [Production entry and final-review correction evidence](live-entry-verification.md):
  exact live/synthetic checks, inventory/branding corrections over `4ddb012`,
  provenance and unwaived release/manual gaps. Its source-only deployment status
  is superseded by the dated deployment packet above.

- The actual reviewer: `bun tests/mobile-hub-review/manage.ts start` (local-only
  by default). Do not start it over another owned instance. See
  [hosting instructions](../../../../tests/mobile-hub-review/hosting.md).
- `/review/design-system`: actual shared UI primitives and task interactions.
- `/review/evidence`: the fixed 20-image current gallery, this guide and the
  [verification/known-issues record](verification.md).
- `gallery/`: Chromium and WebKit examples at 390×844 CSS px, DPR 2, light scheme,
  reduced motion. These illustrate the current UI, **not approved pixel goldens**.
- [Canonical reference index](index.md) and
  [the original design references](../../../../design/hub-mobile/README.md): all
  49 original images remain unchanged. They are the visual foundation, subject to
  the explicit agreed amendments in the reference contract.
- `baseline.json`, `baseline.ts` and `baseline.test.ts`: the immutable historical
  preservation/reference fixture and its tests, not a current run report.
- The change's [proposal](../proposal.md), [design](../design.md),
  [tasks](../tasks.md), [reference contract](../reference-contract.md) and
  [screen map](../screen-map.md).

The reusable reviewer, fixture corpus and behavioral tests remain under
`tests/mobile-hub-review/`. Workspace interiors and live-backend integration are
not redesigned or completed by this evidence cleanup.

## Generate fresh evidence without committing an archive

```sh
bunx --no-install playwright test --config tests/mobile-hub-review/compact-gallery.config.ts
bunx --no-install playwright test --config tests/mobile-hub-review/navigation-recovery.config.ts
bunx --no-install playwright test --config tests/mobile-hub-review/preview-boundary.config.ts
```

Normal screenshots and native JSON reports go to ignored local outputs, primarily
`tests/mobile-hub-review/results/artifacts/`. Raw reports may contain local paths;
they are not publication-safe merely because tests passed.

Only an explicit reviewed promotion updates the fixed gallery:

```sh
UATU_PROMOTE_COMPACT_GALLERY=1 bunx --no-install playwright test --config tests/mobile-hub-review/compact-gallery.config.ts
```

Review the images, update the current verification record and run hosting/privacy
checks before committing a promotion. The server publishes only explicitly named
gallery files and two current Markdown records; it does not expose output folders.

## Historical findings, not active capture dependencies

Existing Markdown findings are retained, with links to this current entry point.
Their dates, outcomes and open limitations are not silently replaced by newer
passes. Earlier generated artifacts and the three retired archive-report scripts
remain in Git at `373ef6350032f6a0f2a91c2037ebafb553bc002f` at their original paths.
For example, `git show <revision>:<repository-relative-path>` recovers an artifact.
The prior, narrower cleanup's older recovery point is documented in
[artifact-cleanup.md](artifact-cleanup.md).

This is a normal deletion commit, not a history rewrite. All 563 previous generated
PNG captures, 49 generated JSON reports and three HTML galleries leave the current
tree; the original reference/baseline fixtures and written findings remain. Three
scripts generating those obsolete multi-generation reports are retired. Product
and behavioral regression tests remain; future detailed matrices can be captured
locally without restoring an artifact archive to the branch tip.
