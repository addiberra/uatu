# Current verification and known issues

**Final acceptance remains open.** The 2026-10-15 user decision authorizes live
integration, not visual/device certification, service rollout, spec sync or archive.

## Current bounded live-facts slice — 2026-10-15

**Approved metadata checkpoint:** the lead confirms renewed independent approval
after the SSH lock/facts and checkout-file corrections, reporting **121 tests
passed**, **208 API tests passed**, both typechecks, build and strict specification
validation passed. These unchanged checks are reused, not rerun for this commit.
See `live-facts-verification.md` for the approval provenance, historical red–green
checks, contrary evidence and conservative supported-config limitations. No
historical release/visual gate is closed by this work.

Task 18.1 is complete; the corresponding initial 18.5 publication is verified,
but 18.5 remains open for subsequent additions. Optional authoritative checkout,
credential protection/lock/public-UID and saved-tool-override facts now flow
through existing owners, authenticated routes and browser decoders. No UI mount,
mutation adapter or service update is included. The user now authorizes this
scoped commit; pushing is deferred until the final handoff. See
[exact checks and limitations](live-facts-verification.md) and the
[integration map](integration-map.md).

Historical original results: focused/route rerun 490 passed; clean-environment credential/worktree
regressions 193 passed; clean-environment `test:api` 208 passed; both TypeScript
projects, API validation, isolated production compile and strict change validation
passed. Earlier environment-sensitive failures and one temporary-runtime cleanup
failure are retained in that evidence, not silently waived. These checks are
self-verification, not independent review or browser/physical-device acceptance.
The broader Chat touch 11 failures and historical archive mismatch remain open.

## Candidate scope

The actual mobile Hub supports grouped Settings, full-page tasks, explicit
command hierarchy, read-only folder selection, creation cancellation to Add
Workspace and Devices under Session Security. The reviewer supplies synthetic
management operations and a mixed Markdown/AsciiDoc/text/code/image/binary corpus
to the real workspace clients. Same-document coordination retains one workspace
through ordinary Hub/Settings detours; reload, cross-workspace replacement,
Stop/removal and authentication invalidation remain distinct boundaries.

The new frontend is not yet wired to live Hub management operations. Workspace
interior layouts and controls are not redesigned. Review hosting defaults to
local-only; an optional public origin requires explicit local configuration.

## Historical pinned-upstream compatibility verification (then-uncommitted merge)

Baseline `37047e5` is retained as `recovery/hub-mobile-navigation-37047e5`.
The merge target is `c3a8306`; no commit, push or PR update is authorized here.
This compatibility work does not complete the outstanding frontend approval
tasks or authorize live mobile backend integration.

Verified during integration:

- `bun install --frozen-lockfile`: locked dependencies installed without changing
  the lockfile. No additional tools or browser downloads.
- `bun run typecheck` and the reviewer TypeScript project: passed.
- Focused resource, load-generation, image revision, visibility, Hub-page and
  navigation checks: 149 passed, 0 failed (1,020 assertions).
- `navigation-recovery.config.ts`: 48/48 Chromium/WebKit cases passed.
- `compatibility.ts`: original production entry passed desktop and touch checks
  in both Chromium and WebKit, with no mobile coordinator injected.
- Production-entry/coordinator/style runtime graph audits passed when run
  directly. The complete `isolation-audit.ts` remains blocked by its historical
  aggregates. Independent review identified two mismatches: references contain
  53 files versus the baseline's 52, and the retained archive contains 25 files
  on both sides but has a different digest. Both trees remain unchanged versus
  baseline HEAD `37047e5`; neither historical aggregate was silently replaced.
- `api:validate`: passed with one existing schema-composition warning.
- `bun run test:api`: 204/204 passed after internal-resource assertion adaptation.
- Reviewer unit suite: 99/99 passed (2,183 assertions).
- Strict validation of this OpenSpec change: passed.
- Production Preview/renderers/incremental-discovery/Follow/manual-selection:
  103/104 passed in one run. The remaining watcher expected the old static image
  URL; after adapting it to exact resource identity plus revision, its focused
  rerun passed and verified the replacement image bytes. The new held-discovery
  test confirms that a connected partial inventory does not imply a boundary.

The broad unit run reached 5,446 passes, 16 skips and seven failures. Two were
internal-resource tests still invoking the removed public OpenAPI operation;
those assertions were adapted to retain byte, status and error-body checks.
Four credential-projection tests also fail in isolation; their implementation
and tests match pinned upstream. Independent review reproduced 24 passes and
four failures in that suite. This session resolves `git` through an existing
Hub-projected wrapper, which is relevant to their ambient-Git expectations but
is not clean-environment proof of the cause or of upstream correctness.
No wrapper, authentication configuration or safety policy was changed. The site
build hook timed out under the parallel run but passed alone (5/5).

Continuity testing found and corrected a missing PTY resize publication on Return
after a hidden resize. The following full run passed 27/28 cases: the remaining
WebKit failure was a Chat scroll baseline becoming zero before the detour, not
the terminal geometry regression. A targeted WebKit run reproduced that failure
while the hidden-terminal test passed. The assertion remains intact.
Independent review also reproduced the zero scroll baseline at
`continuity.e2e.ts:385` before the detour; this remains an unresolved failure,
not a waived test.

Production Hub testing exercised real PTY detachment/reattachment and credential
forms. Legacy selectors needed adaptation for upstream repository grouping,
renamed removal actions and the branch's existing default handle position; long
runs were interrupted once those obsolete selectors were identified. After those
adaptations, Chromium/WebKit forms passed 10/10, Return/management/sign-out passed
2/2, and real PTY lifecycle/isolation passed 2/2. Repository removal tests now use
the guarded worktree dialog and retain confirmation, failure/retry, registry and
on-disk preservation assertions. Additional Hub navigation/history/recovery tests
passed 24 cases before a remaining obsolete empty-state assertion stopped that
run; the corrected long-path and responsive/desktop selection then passed 10/10.
Together the focused reruns cover all 44 production Hub cases, not one clean
full-suite invocation. No golden
images were regenerated or blessed. Full e2e/performance, native Xcode behavior,
and the complete visual matrix are not certified. Full staged whitespace checking
reports two upstream-only trailing blank lines in the archived workspace-activity
change; the diff against pinned upstream has no whitespace errors.

Reproduction commands (run browser configurations separately from unit suites
that reserve fixed review ports):

```sh
bun run typecheck
bun node_modules/typescript/bin/tsc --noEmit -p tests/mobile-hub-review/tsconfig.json
bun run test:api
bun run api:validate
bun test tests/mobile-hub-review
bun run test:ci
bun tests/mobile-hub-review/compatibility.ts
bun node_modules/@playwright/test/cli.js test -c tests/mobile-hub-review/navigation-recovery.config.ts
bun node_modules/@playwright/test/cli.js test -c tests/mobile-hub-review/transition-regression.config.ts
bun node_modules/@playwright/test/cli.js test -c playwright.hub-mobile.config.ts
bun node_modules/@playwright/test/cli.js test --project=e2e tests/e2e/preview-file-navigation.e2e.ts tests/e2e/preview-renderers.e2e.ts tests/e2e/incremental-watch.e2e.ts tests/e2e/follow-mode.e2e.ts tests/e2e/manual-selection.e2e.ts --workers=2
```

### Bounded correction after independent review

Independent review found duplicate Open actions in the real dashboard refresh:
available running checkouts had two buttons, while missing/replaced checkouts
retained one after the availability guard removed the other. Creation is now
consolidated in the row renderer: one primary Open action for available running
checkouts, visible on both layouts with worktree capability and mobile-only for
legacy Hubs. The existing availability guard removes that sole action and
defuses the title link for missing/replaced checkouts.

The DOM harness now runs the actual row renderer as well as `refresh()`. New
available/missing/replaced assertions reproduced all three failures before the
fix. They now pass, including navigation dispatch, primary/mobile-only classes,
legacy behavior, child Open versus stopped-child Start, and unavailable title
links. An obsolete implementation-string assertion was replaced by behavioral
coverage rather than dropped.

- `bun test src/hub/pages.test.ts src/hub/mobile-presentation.test.ts`: 50 passed,
  zero failed, 515 assertions.
- Both TypeScript commands listed above and the correction's whitespace check
  passed. No browser suite or broad investigation was rerun for this bounded fix.
- Only `src/hub/pages.ts`, `src/hub/pages.test.ts` and this evidence record changed
  in the follow-up. The scroll, credential and preservation-audit blockers remain.

All conflicts are resolved and the prior merge work remains staged; the additional
follow-up below is left unstaged for lead review. The merge remains uncommitted.
Follow-up self-checks are not independent validation.
Publication-safety review is still required before any future commit/publication.

### Scroll correction and isolated parallel review follow-up

The original WebKit command reproduced the nonzero-baseline failure twice:

```sh
bun node_modules/@playwright/test/cli.js test -c tests/mobile-hub-review/transition-regression.config.ts --project=webkit --grep 'exact real Files'
```

Targeted scroll instrumentation showed a browser scroll to 210 followed by
`CoordinatedScrollOwner.flush()` writing 0. Its previous extent was 4,569px and
the next measured extent 4,636px: newly laid-out intrinsic rows coincided with
downward movement. The coordinator incorrectly treated that combination as
layout-only, retained the old anchor, then restored it over the reader's position.
It now distinguishes no movement from movement in either direction. Existing
clamp, held-control and programmatic-echo handling is unchanged.

Two new unit cases reproduced the reset before the fix (210 and bottom-arrival
500 both became 0); they now verify the position and subsequent follow intent.
A third guards extent-only semantic restoration. The original continuity test's
nonzero and exact-retention assertions are unchanged; temporary probes were removed.

Fresh results:

- Anchor/coordinator tests: **52 passed**, zero failed.
- Full continuity configuration: **28/28 passed**, Chromium and WebKit, including
  exact scroll roots and hidden-terminal geometry.
- Three further WebKit repetitions each of exact scroll retention and hidden
  terminal geometry: **6/6 passed**.
- Navigation/recovery configuration: **48/48 passed**, Chromium and WebKit.
- Final isolated full unit run in a clean child tool environment with the caller's
  shell retained: **5,464 passed, 16 skipped, zero failed**, 39,243 assertions
  across 332 files. The earlier clean invocation without `SHELL` passed 5,463
  with 17 skips; retaining it exercises the configured-shell case as well.
- Final combined production Hub configuration: **44/44 passed**, Chromium/WebKit.
- Coordinated-following performance matrix: **8/8 passed**, Chromium/WebKit,
  desktop/touch, parent/child; at most one automatic write per frame and zero
  stable-extent upward frames in each case. Integrated-shell budgets were not run.
- Both TypeScript projects passed; production binary built and ad-hoc signature
  verified by the existing build script. No tool/dependency/browser downloads.
- The four runtime bundle isolation audits passed separately. The complete
  historical aggregate audit still fails; see preservation evidence below.

Credential projection is environment-sensitive, not a merge-source divergence:
the unmodified suite produced **24 passes / four failures** with ambient Hub Git
wrappers and **28 passes / zero failures** with a clean child environment. The
same clean environment also passed the full unit run:

```sh
env -i HOME="$HOME" TMPDIR="$TMPDIR" PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin bun test src/hub/credential-context.test.ts
env -i HOME="$HOME" TMPDIR="$TMPDIR" SHELL="$SHELL" PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin bun run test:ci
```

This is invocation-scoped isolation on this macOS host, not a global PATH change,
wrapper edit, authentication change or product workaround.

The first combined production Hub browser run passed 42/44. One credential-form
test treated pre-existing "ready" text as completion of an asynchronous Test;
the ensuing catalog replacement cleared the next card's input. It now additionally
waits for the Test button to become available after Testing. The other expected
the transient workspace-root URL after Return even though startup selected the
newest document. It now establishes and awaits an explicit guide before leaving,
then asserts that exact URL **and content** on Return. These are test sequencing
corrections, not authentication or management behavior changes.
The next full Hub run passed 43/44 and exposed the same transient-root assumption
at initial Start. That step now verifies the exact navigation request to the
workspace root rather than requiring the root alias to remain in the address bar;
the settled guide and subsequent Return still have exact content/URL checks.

Additional evidence limits found by the broader checks:

- A shell-preserving unit run overlapping browser work hit one 4-second
  ignore-pattern watcher timeout (5,463 passed / 16 skipped / one failed).
  The unchanged test passed alone, followed by the isolated full-unit pass above.
  Contention is plausible, not an established root cause of the watcher timeout.
- `chat-touch.e2e.ts` passed **26/37**, with 11 failures: eight expect the navigation
  bar to be visible after answering, two assume Chat ends at the full-width bar's
  top, and one expects the pinned day to cover `yesterday-3-reply` rather than
  `yesterday-3`. A representative answer/bar case and the pinned-day case failed
  identically in isolated runs with both the corrected and pre-fix scroll
  condition. The corrected source was restored with an exact SHA-256 match.
  These additional compatibility gaps remain open and unwaived; the whole Chat
  suite is not green. No assertions in that suite were changed. Further diagnosis
  belongs in the lead's next scope decision, not a claim of complete app validation.

Additional reproduction commands:

```sh
env -i HOME="$HOME" TMPDIR="$TMPDIR" PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin bun node_modules/@playwright/test/cli.js test -c playwright.hub-mobile.config.ts
bun node_modules/@playwright/test/cli.js test --project=perf tests/e2e/chat-follow-stability.e2e.ts --grep 'coordinated following' --workers=1
bun node_modules/@playwright/test/cli.js test --project=e2e tests/e2e/chat-touch.e2e.ts --workers=2
```

Preservation reconciliation (no baseline or golden edits):

- The additional reference file is `design/hub-mobile/design-system.md`, added
  in `b7d51f7` and subsequently maintained. Excluding only that guide reproduces
  the original 52-file digest exactly:
  `38940ab1a56a7195f574b1dd3a124d463946ff864ed513384849a13f4bfea6b0`.
  All original reference content, paths, sizes and modes therefore match the
  captured aggregate; the whole current reference tree remains unchanged versus
  premerge HEAD.
- The 25-file retained archive is unchanged versus both its first committed
  checkpoint `c259efb` and premerge HEAD. Its current digest is
  `34055380d75c874bec9ca8d0cf34ec07ac5006e46103241dacecabdcbb6a1d23`, not the
  dirty-tree baseline's `123a7512ad3b3b5b0043d298c7d9500f70a9ece30e48e9d160603281e5f7de60`.
  The baseline has no per-file hashes/source bytes to identify the earlier
  difference. The aggregate guard remains intact and failing, not waived.

Authorized deployment is separate from mobile integration:

- A production binary of the current uncommitted merged tree runs under its own
  user launchd job, unused loopback port, private external runtime/state/home and
  random-password Hub account. Three newly generated Git repositories contain
  Markdown, AsciiDoc, text, code, SVG and binary navigation examples, an alternate
  branch, and deliberate working changes. They were registered and started via
  the supported authenticated Hub API; the setup bearer session was revoked.
- A second isolated launchd job serves the newer mobile frontend with its
  **synthetic backend only**. No live management integration was introduced.
- Two previously unused tailnet-only HTTPS Serve ports were added with `--bg`.
  Existing routes/services are preserved; no Funnel, auth bypass, personal repo
  copy, provider login or secret copied from the host. The live test home has no
  configured Chat provider; this is not a provider-login or real-agent test.
- Loopback and local-machine tailnet HTTPS checks succeeded. Anonymous live API
  requests returned 401. Cached Chromium phone-emulation smoke signed in, checked
  one Open per fixture, previewed two real workspaces and a linked long document,
  signed out, then exercised synthetic Atlas → Hub → Settings → Return. A subsequent
  final smoke also verified the synthetic terminal WebSocket through tailnet HTTPS.
  The browser connector's separate Chrome installation was absent; the already
  installed project Playwright browser was used instead, without installing it.
- Hostnames, credentials, PIDs, logs, screenshots and exact scoped lifecycle
  commands are retained only in the external private runtime and session handoff,
  not tracked documentation. launchd survives this agent session but these
  temporary-runtime jobs are not installed for automatic login/reboot startup.
  No remote physical-device or native Xcode verification is claimed.

## Historical compact-package verification (before compatibility merge)

The gallery contains ten scenes in each of Chromium and WebKit at 390×844 CSS px,
DPR 2, light scheme and reduced motion. The 20 explicit promotion captures passed
in 23.4s. Source: the cleanup working tree based on `373ef63`; product code is
unchanged and the frontend asset fingerprint remains
`sha256:dc2b6253b6434c9bb194ef49e58ccbfff7c2080f64da27acb96199db3177b996`.
No image is an approved golden; normal capture output stays locally ignored.

Historical checks for the compact package:

- **448 tests / 5399 assertions passed** in the focused mobile Hub/reviewer,
  Preview, boot/navigation, privacy and preservation-baseline suites.
- Both TypeScript checks, whitespace and strict OpenSpec validation passed.
- **48/48** Chromium/WebKit navigation/flow/preview cases (59.9s).
- **4/4** Chromium/WebKit retained-workspace boundary cases (18.2s).
- **3/3** Chromium design-system interaction/responsive cases (4.0s).
- **22/22** Chromium/WebKit current-gallery and publisher cases (14.8s), including
  loading all 20 PNGs, responsive gallery layout and rejection of raw/history paths.
- Runtime bundle audits for the production entry, mobile coordinator and scoped
  styles passed with no privileged/test modules or fixture markers in those graphs.
- The publisher has exactly 22 selected source files: 20 PNGs and two Markdown
  records. Paths, PNG dimensions, content hashes, inert-text MIME and privacy/access
  boundaries are covered by tests. The canonical reference and baseline fixtures
  are unchanged. No product source or behavioral regression test was removed.

Commands are in [the reviewer guide](../../../../tests/mobile-hub-review/README.md).
The two current records and fresh images replace 618 generated archive files/scripts
in a normal cleanup commit; older files remain in Git history. The existing running
reviewer was not restarted, and this cleanup does not update a remote branch.

## Established functional coverage

The retained detailed findings also record these scoped passes (not additive to
the current checks above):

- 444 unit tests / 5453 assertions across mobile Hub/reviewer, Preview, boot,
  navigation, privacy and preservation-baseline checks; both TypeScript checks.
- 48 Chromium/WebKit flow/preview cases: cancellation/history, nested drafts,
  late reads, Security/Devices, folder selection, mixed-format siblings,
  index resume/Retry and direct image/binary load/reload.
- Nine normal-server Chromium Preview regressions: boundaries, failure/retry,
  duplicate roots, encoded URLs, layout, Chat drafts and terminal continuity.
  That separate harness uses test-owned files and a test PTY; the reviewer is
  synthetic and never uses a live Hub or personal workspace.
- Four Chromium/WebKit retention cases: all four surfaces and exact Chat
  draft/File plus terminal transport through Hub/Settings detours.

Those results are scoped evidence, not a complete current full-repository pass.
See [navigation findings](navigation-recovery/verification.md),
[preview/control findings](preview-refinement/verification.md), and
[privacy findings](privacy-sanitization.md). Raw run reports remain in Git history.

## Open issues and evidence limits

- No approved pixel-golden set or explicit final visual/interaction approval.
- The complete current app/option/scenario matrix remains unfinished. A small
  current gallery is not a substitute for testing unpictured states.
- Exact dirty pre-change all-four-workspace-interior/desktop proof remains
  incomplete. Existing reference and desktop baseline fixtures are retained.
- Historical native browser/HTTP/rendering stalls remain an open investigation.
  The responsive history includes an Open-click timeout where the Settings dock
  button intercepted pointer events. That actionability/occlusion evidence must
  not be flattened into a generic transport-wait explanation.
- Historical matrix sequence includes 1022 pass / 33 fail / 8 untested initially;
  a failed preflight with 50 pass / 1 fail / 14 untested / 1 unsupported; three
  1070-pass runs followed by 1001 pass / 4 fail / 46 untested / 1 unsupported;
  and a final 1102 pass / 0 fail / 0 untested / 1 unsupported. None is a fresh
  pass for every current UI state. Details: [responsive findings](responsive/README.md).
- HTTP connection reuse, font handling and tracing have not been established as
  universal causes of the historical stalls. Targeted newer passes do not waive
  the broader gate or prove all earlier failures share one cause.
- Physical iPhone/VoiceOver/keyboard/OS text scaling and safe-area behavior are
  not certified. WebKit reduced-transparency emulation was unsupported in the
  recorded matrix. Browser text enlargement is not native Dynamic Type.
- Local clone/credential/provider/live-backend correctness and deployment of
  the new mobile frontend require separately authorized integration work.

Pending tasks **7.1, 7.4, 8.3, 9.6, 10.4 and 11.4** remain pending. The retained
diagnostic notes under `tests/mobile-hub-review/evidence/` describe unresolved
investigations; their local trace files are neither deleted nor published here.
