# Production mobile entry checkpoint

This is candidate-source implementation and self-verification, not independent
review, deployment approval, final visual acceptance or a physical-device test.
The existing live/synthetic services and private parallel runtime are unchanged.

## Assembly and authority

- `src/workspace-entry.ts` retains the existing app default for standalone and
  desktop. Eligible Hub touch entry installs the same-document coordinator before
  one lazy app boot, using the injected fixed base path and original document URL.
- The authenticated `/`, `/settings?detail=…` and `/clone` documents load a
  compiled product HTMLBundle. The pre-paint phone decision uses the existing
  scoped presentation key and coarse-pointer default. Only that selected phone
  branch skips/removes the legacy controller/forms; desktop rendering stays intact.
- Direct Hub entry owns task history and read refresh, but no fabricated workspace.
  Its open inventory holds a scoped worktrees-only broker subscription; outside
  that page it owns no stream. Auth loss stops refresh replacing a login draft.
  Canonical Open establishes the workspace document; subsequent ordinary detours
  retain it. Mode escape, cross-workspace Open and invalidation reload boundaries
  remain explicit.
- Workspace recovery reuses the existing broker, HTTP/WS URL owners, Hub auth and
  session-running signals. Transport loss alone is not Stop. Per-workspace fences
  cancel pending Start/Return without discarding an authenticated management
  command's result when its dependent Stop occurs first. The new race regression
  failed before separating these generations and passed afterward.
- Notifications has one existing enrollment owner in focused Settings; retained
  phone workspaces do not also mount the desktop dialog. All worktree, account,
  credential, lifecycle, onboarding and clone adapters are reachable, not stubs.
- Public revisions stay **Hub 14 / workspace 24**: this assembly consumes existing
  contracts. New static assets carry no protected data. API/browser traffic keeps
  its auth, CSRF and origin checks. Only a bounded, credential-free self-fetch of
  this server's static bundle template permits its configured TLS certificate.
  Extracted tags are reconstructed using only the existing root-relative bundled
  asset namespace: external URLs, application/API paths and event attributes
  cannot enter the page through that fetch. Adversarial unit checks cover this.

## Evidence provenance

`playwright.mobile-live.config.ts` now uses production HTML/assets without HTML
substitution. APIs reach real Hub owners over disposable test resources. Agent
logins use the existing fake account runtimes; notification platform APIs are
explicit doubles; the new optional clone process double spawns no Git/network/PTY.
Live retention uses the existing deterministic private-home PTY harness and fake
Chat provider. These are not personal-provider or OS push-delivery tests.

The synthetic reviewer still substitutes only its test entry/transport and fails
closed. Its config accepts `UATU_MOBILE_REVIEW_PORT` so verification can use an
unused listener without stopping the existing process on 4703. No fixture,
scenario controller or privileged server module is allowed in either browser
entry's graph.

Checks already executed before the final expanded matrix:

- `bun run api:validate`: valid; unchanged single-schema `WorkspaceConflict`
  `allOf` lint warning.
- `bun run test:api`: **212 passed**, 1,851 assertions.
- Focused mobile/PWA/bundle/transport/worktree suite: **486 passed**, 5,772
  assertions before the additional generation and document tests.
- Product and review TypeScript projects passed after the expanded browser cases.
- `bun run build` and isolated `bun run smoke` passed, including compiled desktop
  worktree controls and compiled phone Hub/logo/assets → workspace → Settings →
  Return with exact root identity and no page errors. The smoke ran with a new
  private HOME and the installed browser cache explicitly selected. An earlier
  attempt lacked that cache path and hit a guardian cold-start timeout; a focused
  guardian check then returned code 2 in 467ms and both later smokes passed.
- Browser iterations caught test precondition/selector errors (hidden legacy
  forms, exact upload route, an enable action that needs no confirmation, and the
  fixture's missing clone-attempt store), not silently accepted failures. Phone
  assembly now removes the duplicate legacy form tree. Full rerun results follow
  separately; partial earlier matrices are not reported as all-green.

### Expanded live browser result

`bunx playwright test -c playwright.mobile-live.config.ts`: **46 passed**, both
Chromium and WebKit, production documents/assets and real Hub routes. Includes
all four surfaces/one boot/one broker/one terminal attachment, Back/Forward,
direct/reloaded Settings with no fabricated workspace, cold loading Back and
late completion, manage B/Return A, external Stop/revoke, exact File identity and
one pending upload, draft/broker/PTY progression, hidden-input and nonzero resize
guards, and the coordinated assignment Stop/result race. Worktree, account,
notification, create/Forget, token and lost-clone-acceptance cases also pass.

The preceding **45/46** iteration exposed a WebKit multipart MIME refusal when
the test replayed a browser upload via `route.fetch()`. Holding then continuing
the original browser request preserved its multipart bytes; the real upload must
still return **201**, and the exact File/one-upload/retention assertions remain.
The focused case passed in both engines, followed by the complete 46-case pass.
No product upload handling, assertion or golden was weakened.

A broad worktree/mobile unit run reported **793 pass / 3 fail**: the expanded
multi-operation adapter test exceeded its 5s deadline, and the strict later Git
counter differed by three calls (unfinished-work contamination is suspected,
not established independently). The document test also read a newly
edited expectation against that run's already-cached module. The adapter checks
are now split into smaller deletion and registration scenarios with the original
assertions and deadline retained. A stable-source rerun is required and recorded
separately; this failed run is not called green.

The stable-source repeat of that same broad unit command passed **797 tests**,
**0 failures**, **7,781 assertions**, across 53 files. No deadlines, Git-counter
assertions or fault-injection checks were removed. The current production build,
both TypeScript projects, bundle graph guards and `git diff --check` also pass.

The existing listener on 4703 was detected and preserved. A separate synthetic
verification can use an unused port, for example:

```sh
UATU_MOBILE_REVIEW_PORT=4793 bun node_modules/@playwright/test/cli.js test -c playwright.mobile-hub-review.config.ts tests/mobile-hub-review/continuity.e2e.ts
```

Check that the selected listener is free first; Playwright starts and stops only
its own test server. This command does not restart an existing reviewer.
Use Bun for this suite: its test imports include Bun-supported file assets; a
Node-based `bunx playwright` launch fails before running those cases.

## Unwaived obligations

### Cold notification/history follow-up (2026-10-16)

A delayed cold workspace boot behind Settings exposed a real loss of the
`conversation` query: Chat and selection history read the foreground Hub URL.
The existing coordinator now supplies its workspace URL/state through the same
context that owns writes, without another cache. Chat reads the original entry
destination, and subsequent workspace history changes read that workspace owner.
The regression failed in Chromium/WebKit before this correction and now passes.

- `bun run typecheck` and `bunx tsc --noEmit -p tests/mobile-hub-review/tsconfig.json`: passed.
- Focused coordinator/context/history/Chat/bundle unit command: **9 passed**, 487 assertions.
- `bun node_modules/@playwright/test/cli.js test -c playwright.mobile-live.config.ts --grep 'cold notification|exact scroll roots|transport loss and reconnect'`: **6 passed**, both engines.
- Exact Files/Preview/Chat scroll offsets, rendered terminal scrollback and exact
  terminal dimensions survive detours. A preceding **5/6** run sampled WebKit's
  translating rectangle at 390.0000305175781px instead of 390px. The check now waits
  for exact original dimensions; no tolerance or geometry assertion was relaxed.
- Reconnect behind Settings keeps the same workspace and one broker subscription;
  the injected transport loss is not treated as an authoritative Stop.

### Additional command-owner investigation (2026-10-16)

- Real disposable SSH/OpenPGP browser checks now generate, inspect public-only
  facts, unlock, check, disable/enable, delete and re-import keys in a private
  fixture HOME. Repository tokens still emit no Agent accounts writes. Tool and
  separate authentication/signing assignment checks use the real routes too.
  Earlier live iterations were partial, not green: the initial assignment check
  read the wrong catalog level; subsequent runs found the history/folder issues
  below. One WebKit OpenPGP result-view loss did not reproduce in instrumented
  repeats (generation then took about 1.2–1.3s); its original cause is unproven.
  A later 15/16 run still sampled workspace content before the real Start/entry
  had settled. Current checks await the real Start response before boot content;
  no transport deadline or existing boot/geometry tolerance was widened.
- Direct-Hub Start exposed an owned task-history Back racing document navigation.
  Direct entry now waits for that traversal, with intent/auth/disposal fences;
  it does not change the server Start or manufacture another workspace realm.
- A deterministic red unit regression also showed transient authentication-read
  failure discarding a pending credential command. Failed revalidation now
  preserves its owner and presents a connection-unconfirmed notice. Authoritative
  unauthorized/session/user-change boundaries still invalidate it. A real-route
  held-response/503 regression exercises the same ownership seam.
- Start without assignments was incorrectly presented as an editor. Its explicit
  confirmation now owns modal focus and a non-destructive Start action. WebKit
  confirmation traversal explicitly cycles its controls after busy failure;
  editors keep nonmodal native traversal. Unit regressions failed before each fix.
- The fixture's folder manager was accidentally supplied under the unused
  `folders` option. Wiring `folderManager` enables the actual folder routes; no
  product route, authorization or refusal was bypassed.
- The first expanded synthetic discovery was **294 passed / 48 failed** across
  **342 cases**. Besides the Start presentation defect and local reference-page
  focus recovery, failures identified retired selectors, old read-only fact prose,
  old folder/Devices navigation, missing report-to-results Back, and capture-only
  hardcoded port 4732. Updated checks retain facts, counts, masking, cancellation,
  exact partial outcomes and isolation; port checks still refuse published
  listeners and now verify the selected loopback synthetic server's health.
- OpenPGP error scrolling was measured, not relaxed: the longer error needed
  exactly six pixels to reveal its bottom in the short viewport. The regression
  asserts that exact movement, the visible alert boundary and unchanged document
  and underlying Settings scroll, rather than requiring the error to stay clipped.
- Responsive discovery produced **1,102 PASS / 0 FAIL / 1 UNSUPPORTED**. A concurrent
  Playwright startup cleared some ephemeral captures in the shared output tree;
  that run is behavioral discovery, not a retained comparison set. The runner now
  accepts `RESPONSIVE_OUTPUT_DIR` for separately retained captures. No reference,
  approved golden or curated gallery was changed.

Latest live rerun:

```sh
bun node_modules/@playwright/test/cli.js test -c playwright.mobile-live.config.ts --output=test-results/live-current
```

**66 passed**, both engines, production HTML/assets and real Hub/API owners.
This includes the new actual SSH/OpenPGP lifecycle, tool override, separate
assignment/no-op/host preservation, all-required-unlocks-before-one-Start, real
folder maintenance/collision/fallback, held accepted credential plus failed
revalidation, explicit B/reload boundaries, and all prior account/notification/
worktree/clone/continuity cases. The stated account/platform/PTY/clone doubles
remain doubles; no personal provider was tested. The focused ownership units
passed **67/67** (597 assertions); both TypeScript projects pass. The subsequent
last-test precondition tightening awaits its focused repeat.

### Reconciled synthetic matrix (2026-10-16)

```sh
UATU_MOBILE_REVIEW_PORT=4793 bun node_modules/@playwright/test/cli.js test -c playwright.mobile-hub-review.config.ts --output=tests/mobile-hub-review/results/reconciled-matrix
```

**342 passed / 0 failed**, Chromium and WebKit, no retries (6.6 minutes).
This supersedes the partial 338/342 discovery, not its retained failure record.
The synthetic backend remains explicitly simulated and fail-closed. Existing
operation/fact/count/masking/partial-outcome assertions remain; changes reconcile
current direct actions, semantic facts, focused folder maintenance, diagnostic
report/results Back and the actual canonical image path. Assignment completion
waits for the task owner's native history traversal before document navigation.
The local-only design-system reference restores focus to the activated button,
including WebKit touch clicks that do not focus it automatically.

The prior one-off Chromium delayed-Hub-visibility failure did not recur in the
focused repeats or this matrix. Its original cause is not established; future
failures persist animation/root geometry in `continuity-failure-geometry.json`.
This is not a timeout waiver or evidence that the original failure never occurred.

All three TypeScript projects and a production build passed at `781902c` plus
these test-only edits. The private-HOME compiled smoke passed guardian EOF
refusal, auth, assets, document/live delivery, desktop worktree entry and phone
Hub → workspace → Settings → Return with no page errors. Build warnings remain
the existing unsupported CSS `highlight` selector warnings.

### Retained responsive result (2026-10-16)

```sh
RESPONSIVE_OUTPUT_DIR=.local/mobile-responsive-reconciled bun tests/mobile-hub-review/responsive.e2e.ts
```

**1,102 PASS / 0 FAIL / 0 UNTESTED / 1 UNSUPPORTED**. Full selection
(`selectedCases: null`), Chromium 153.0.8010.12 and WebKit 26.6, Bun 1.4.2.
The local `results.json`, `scenarios.md` and 22 PNGs are retained separately from
Playwright's cleaned directory. This exercises 320×740, 390×844, 844×390 and
820×1180, light/dark, scoped 100/200% text, focused-input viewport reduction,
contrast, forced colors and reduced preferences. WebKit reduced-transparency
emulation is unsupported. Text stress is not native Dynamic Type; viewport
reduction is not a physical keyboard or safe-area/device certification.

The retained earlier run in `.local/mobile-responsive-20261016` was
**1,101 PASS / 1 FAIL / 1 UNSUPPORTED**: WebKit 320×740 dark 200% sampled the
workspace mid-entry translation. The current static-composition audit awaits
exact x=0 and no tab-bar translation; it does not widen any bounds or replace the
separate transition/input tests. The focused diagnostic had 82 passes, no failures
and one unsupported check; only the full result above is called a full matrix.
Editors now check nonmodal focus isolation (browser chrome traversal is allowed);
consequential confirmations still require modal focus containment.

Sampled the retained short-landscape editor, narrow assignment page and narrow
200% dark credential page: the header commands remain visible and long content
uses its scrolling body. These are self-inspection, not approved reference/pixel
comparisons. No goldens, archived bytes or curated published gallery were changed.
The current integration/cold-entry and editor/history/continuity gates 10.4/11.4
now have current cross-engine results and captures. Broader reference comparisons,
native/device checks, desktop reconciliation and human acceptance remain separate.

### Candidate capability/action map

This is the implemented product routing map, **not a deployed-candidate approval**.
The full published operation inventory remains `api/operations.yaml` and
`api/streaming.yaml`; public revisions are Hub/workspace **14/24**.

| Phone destination | Authoritative operations | Evidence seam |
| --- | --- | --- |
| Hub, Settings, workspace | `/`, `/settings?detail=…`, `/clone`, `/s/<id>/…`; fixed workspace HTTP/WS and `/api/hub/live` broker | `mobile-live-continuity.e2e.ts`, compiled smoke |
| Sign in, Session Security, Devices | `/login`, `/logout`, `/api/hub/state`, `/api/hub/sessions` and handle-scoped revoke | live auth units, Hub API contracts, account/continuity browser checks |
| Credentials | `/api/hub/credentials`: SSH/OpenPGP generate/import, token create; applicable public-key/unlock/lock/test/enable/disable/delete | real disposable key/token browsers; credential API and adapter tests |
| Credential Tools and Assignments | `/api/hub/credential-tools`, tool test/override; workspace credential-assignments and credential assign/unassign | real tool/host/no-op/multi-key Start browsers; coordinated-stop units/contracts |
| Agent accounts (separate group) | `/api/hub/agent-accounts`, key/login/logout/activate and attempt code/redirect/cancel | real routes with explicitly fake account runtimes; no personal provider login |
| Notifications | existing `/api/hub/notifications` GET/PUT/DELETE and enrollment owner | real enrollment routes, platform permission/PushManager doubles; no OS delivery claim |
| Workspace actions | session start/stop, workspace display-name/forget | real Hub lifecycle/credential checks; Forget preserves files |
| Add Workspace, Default Folder, Manage Folders | browse, workspace-defaults, configure/create; folders create/rename/remove | real temporary paths and Git; refusal/partial-result adapter and API tests |
| Checkout More and multi-checkout disclosure | worktrees inventory/fetch/create/open/register/forget/preflight-delete/delete | real Git/Hub browser and API checks; HTTP-200 refusals and local-data confirmation retained |
| Clone | clone-jobs, owner-bound clone-attempt reconcile, events/input/cancel | real job/API owners; deterministic browser process double, real local-Git integration tests separately |

Rollback is entry/build selection, not deletion of runtime state: the lead must
name the preceding approved production artifact and exact service scope before
any update; retain credentials, registries, workspaces and existing configuration.
No tested local binary has replaced the existing live service. The synthetic
reviewer's reset/restart instructions in `handoff.md` remain separate and are not
instructions to reset live state. Tasks 8.3/23.1/23.2 remain acceptance/handoff
gates, not authority inferred from this map.

### Desktop and standalone regression result (2026-10-16)

```sh
bun node_modules/@playwright/test/cli.js test --project=e2e tests/e2e/worktree-ui.e2e.ts --grep 'worktree dialog on desktop' --workers=1 --output=test-results/desktop-settled
bun node_modules/typescript/bin/tsc --noEmit -p tests/tsconfig.worktree.json
bun tests/mobile-hub-review/compatibility.ts
```

**6/6 desktop browser cases passed** (35.1s); worktree type checking passed;
**4/4 standalone Chromium/WebKit × desktop/touch checks passed**. The earlier
desktop lifecycle/credential baseline also passed. Current desktop-inset/iPad
viewport browser evidence in `test-results/insets-current` is **15/15**, not native
Desktop or physical iPad validation.

Desktop iterations were not all green: 4/7 initial cases, then 2/6 after only the
inventory-readiness correction. The retained `desktop-disclosure-probe` trace
proves `locator("summary")` matched the group summary **and** nested More actions;
the helper's catch swallowed the strict-mode failure without any click. Selecting
the disclosure's direct child summary and removing the catch fixes the actual
precondition. The helper still waits for authoritative registered rows and asserts
that disclosures are open. A later 5/6 exposed the same descendant-selector issue
in the standalone-heading assertion; it now selects the direct summary too.

The live-event test also sampled its heading before the initial list settled, so
Git changes could enter that first response without an additional live event.
It now waits for loading/aria-busy to settle and asserts its new branch absent
before changing Git. It does not assume the worker's shared repository has no
other unregistered checkouts: an earlier test intentionally leaves a forgotten
Git checkout. The intermediate all-registered assumption failed 5/6 and was
corrected to that actual precondition. The final test still requires a new live
event, the same dialog, one stream, no navigation and stream closure on Cancel.

No desktop product renderer/style was changed in this reconciliation. Comparing
the retained desktop grouping screenshot to the older archived worktree capture
shows the same Active/repository/main/children/stopped-disclosure structure.
Current branding, Notifications and inherited-policy text reflect intervening
upstream work, not exceptions invented for this change; the desktop grouping
module is byte-unchanged against pre-integration `20247bc`. This limited comparison
does not reconstruct the missing exact historical four-interior/native baseline
or complete 7.4/22.3. Type-only `AccountField[]` fixture annotations repair two
literal-widening errors exposed by the worktree TypeScript project, with no value
or product API change. Temporary disclosure instrumentation was removed.

Current historical Chat reproduction:

```sh
bun node_modules/@playwright/test/cli.js test --project=e2e tests/e2e/chat-touch.e2e.ts --workers=1 --output=test-results/chat-touch-current
```

**26 passed / 11 failed**, same categories as the prior evidence: eight hidden
navigation-bar expectations, two Chat/bar boundary assumptions and one pinned-day
message identity. The suite was not edited, waived or described as passing.

The historical archive still has 25 files with digest
`34055380d75c874bec9ca8d0cf34ec07ac5006e46103241dacecabdcbb6a1d23`, unchanged
against `c259efb`; it still differs from the original dirty-tree aggregate. That
baseline has no per-file data to recover the cause. `baseline.ts verify` still
fails, and neither it nor any golden was changed. Historical Chat touch failures
also remain unwaived pending their current reproduction and lead scope decision.
Physical/native checks, version-specific human acceptance (8.3), and lead-reviewed
service scope (23.2) remain separate. No push, deployment, spec sync or archive.

### Broad-unit investigation and current API contracts (2026-10-16)

The first expanded 97-file unit run was **1,370 pass / 1 skip / 11 fail**, 11,194
assertions, not a green result. Four credential-projection failures reproduced in
`bun test src/hub/credential-context.test.ts` (**24 pass / 4 fail**). The shell's
inherited `GIT_CONFIG_*` overrides hid the fixture's own ambient Git configuration.
Running that unchanged file with an empty environment, private HOME and explicit
installed-tool PATH passed **28/28**, 180 assertions. No operator Git configuration,
authentication setting or product credential safeguard was changed.

Two minimized test-order commands reproduced the six DOM failures:

```sh
bun test src/hub/dashboard-groups.test.ts src/hub/mobile/frontend.test.ts src/hub/mobile/coordinator-context.test.ts
bun test src/shell/hub-nav.test.ts src/hub/mobile/frontend.test.ts
```

The first was **54 pass / 1 fail**: the dashboard fixture leaked `window` and
`document`, causing native Event dispatch into a Linkedom target. The second was
**116 pass / 5 fail**: restoring an inherited focus function by assignment left
new own properties on Linkedom anchor/button prototypes, shadowing later tests'
focus model. Restoring exact descriptors (deleting previously absent properties)
and restoring dashboard globals removes the contamination without changing any
product focus code or focus assertions.

The remaining old flow expectation treated a failed authentication connection as
authoritative sign-out, contrary to the implemented transient-ownership policy.
Cancel and authoritative unauthorized reads still assert clearing the original
secret node and hiding protected detail. A separate transient-read regression now
asserts the same masked native draft, no write, visible unconfirmed notice,
successful revalidation without remount and secret clearing on subsequent
authoritative invalidation. The pending-command real-route regression still
requires submitted secrets to clear before the held result arrives.

The combined five-file reproducer/regression run passed **216/216**, 1,446
assertions; main type checking and whitespace checks passed. A full private-HOME
repeat of all 97 files is tracked separately below; focused green results do not
relabel the original 11 failures as passing.

The full repeat passed **1,382 tests / 1 opt-in skip / 0 failures**, **11,256
assertions**, across **97 files** (128s). It used a newly created private HOME,
approved temporary root and `env -i` with only HOME/TMPDIR/PATH. The sole skip is
the existing `UATU_REAL_OPENCODE=1`-gated real-account store/propagation test, not
a silently omitted required case or evidence of a personal-provider login.
The gate was unset; no binary installation, model call or provider fallback was
attempted. Account-runtime/browser doubles remain explicitly labeled above.

Exact test selection (with the isolated environment prefix described above):

```sh
bun test src/hub/mobile tests/mobile-hub-review src/pwa \
  src/hub/worktree*.test.ts src/hub/clone-attempts.test.ts \
  src/hub/clone-jobs.test.ts src/hub/clone-process.test.ts \
  src/hub/folder-manager.test.ts src/hub/credential*.test.ts \
  src/hub/agent-account*.test.ts src/hub/sessions.test.ts \
  src/hub/checkout-facts.test.ts src/hub/live-sse.test.ts \
  src/hub/dashboard-groups.test.ts src/shared/browser-bundle-discipline.test.ts \
  src/shared/app-url*.test.ts src/shell/navigation*.test.ts \
  src/shell/hub-nav.test.ts src/shell/history.test.ts \
  src/shell/bounded-fetch.test.ts src/shell/chat-login-link.test.ts
```

At this earlier checkpoint, no product source or public contract changed after
`781902c`; those corrections are test isolation, current-flow assertions and
evidence. Together with the real
Hub 66-case result and tightened multi-key Start repeat (**2/2**), current API
contracts, full synthetic matrix, all three TypeScript projects and build/smoke,
this completes the scoped automated gate 22.2. It is not an all-repository,
independent, native-device or approved visual-baseline pass.

`bun run test:api` passed **212/212**, 1,851 assertions, across nine files (27.11s),
separate from fixture-backed browser runs. Main/review/worktree TypeScript
projects, strict OpenSpec validation and `bun run api:validate` pass; the unchanged
single-schema `WorkspaceConflict.allOf` warning remains. Public revisions and
published payloads are unchanged by these test/evidence corrections.

### Remaining lead decisions and acceptance boundaries

| Open task | Missing evidence or authority |
| --- | --- |
| 7.1 | Approved deterministic pixel goldens/reference comparisons; current captures and mutation/geometry guards are not golden approval. |
| 7.4 | Exact historical dirty-tree four-interior/native comparison baseline cannot be reconstructed from the retained aggregate-only record. Current desktop/standalone checks do not replace it. |
| 8.3 | A named served version and explicit reviewer visual/interaction decision, including enumerated exceptions. Design-direction/integration authorization is not that decision. |
| 9.6 | The current behavioral/responsive matrices pass, but the complete before/after UX comparison package remains unreconciled. No historical mismatch is accepted as a new baseline. |
| 22.3 | Complete agreed-reference phone comparisons and the missing historical/native evidence; physical/native checks remain unperformed, not emulated passes. |
| 23.1 | Final parity/gate handoff and version-specific acceptance; the local action map and isolated smoke are preparation, not release approval. |
| 23.2 | Lead confirmation of exact service/resource scope, approved artifact and rollback selection before any running-service change. |

The lead must also decide the scope of any investigation/correction for the
unmodified historical Chat-touch **11 failures** and the archive digest mismatch.
Neither was waived or absorbed into a broader redesign. The 25-file archive and
refined screenshots still match `c259efb` byte-for-byte; the read-only baseline
verifier still reports the original retained-archive digest discrepancy. Normal
evolution of HEAD/index/status is separate from that unexplained archive mismatch.

No assertion, golden or archive was changed to waive an unrelated failure. The
test-order fixes restore harness state; the auth tests explicitly separate
transient transport loss from authoritative invalidation while retaining secret
clearing. These changes add no dependencies or product auth/config writes. This
review is self-review only, not independent validation. Existing listener PIDs on
4717, 4718 and occupied 4703 were preserved; private runtime state was not reset.

Task reconciliation is **93/100 complete**: 18.4, 20.1–20.3, 21.1–21.2, 21.5 and
22.1 now have the real-route/adapter/contract evidence mapped above; 10.4/11.4
have current cross-engine evidence; 22.2 has the current complete scoped checks;
22.4 records the unwaived historical failures and the seven remaining gates in
the table. This closes evidence reconciliation, not those release blockers.

### Final-review inventory and branding corrections — 2026-10-16

This bounded correction starts from clean `4ddb012`. The lead supplied an
independent review identifying missing mobile inventory invalidation and the
Settings identity logo's wrong route. The checks below are correction-author
self-verification, not renewed independent approval or a served-version update.

- The mounted inventory now consumes `uatu:worktrees-invalidated` and explicit
  Hub refreshes. A single serialized read coalesces bursts and takes at most one
  trailing refresh; superseded success/connection-failure results cannot replace
  newer facts. Unauthorized results still invalidate authentication.
- Page lifecycle cleanup releases observers before a detail change, editor,
  confirmation, navigation, invalidation or destroy. List updates preserve the
  page/heading, native action focus by checkout identity and its scrolling owner;
  pending reads cannot replace an editor/draft or resurrect departed content.
- Retained A uses hub-nav's existing event relay **without replacing its topic
  consumer** (`subscribe` replaces a key, it does not refcount). Direct Hub
  inventory uses the existing channel/recovery modules for one temporary
  worktrees-only stream. Managing B while A remains retained uses bounded
  five-second visible-inventory reconciliation because the existing wire scopes
  worktrees to the stream's workspace. It opens no second stream, changes no wire
  contract and stops before an editor or page departure. This is not a new
  repository-wide poll or a broker/service replacement.
- Header and Settings identity use the same supplied branding URL. Production
  direct and retained entries supply `/hub-assets/logo.svg`; synthetic entry
  retains its existing base-scoped asset fallback.

Red evidence: the original event + Hub-refresh regression kept **one** inventory
read and omitted the new checkout; the supplied-brand unit and both production
browser engines found `/assets/uatu-logo.svg` on the identity image. A further
red test showed obsolete failed revalidation retiring the observer before its
newer read. The added retained-B check exposed the stream-scope gap; its first
Chromium iteration also caught an unsettled initial response, so the final test
waits for initial inventory/attach readiness before changing Git. Initial browser
setup also omitted the credential API needed by the real read adapter; enabling
that fixture option restored the actual route rather than bypassing a refusal.

Executed on the correction:

```sh
bun test src/hub/mobile src/shell/worktree-live.test.ts src/shell/live.test.ts src/shell/live-channel.test.ts src/shell/recovery.test.ts src/shared/browser-bundle-discipline.test.ts src/shared/app-url-discipline.test.ts
bun run typecheck
bun node_modules/typescript/bin/tsc --noEmit -p tests/mobile-hub-review/tsconfig.json
bun node_modules/typescript/bin/tsc --noEmit -p tests/tsconfig.worktree.json
bunx --no-install openspec validate restore-refined-mobile-hub-experience --strict
UATU_E2E_HUB_BASE_PORT=23000 bun node_modules/@playwright/test/cli.js test -c playwright.mobile-live.config.ts tests/e2e/mobile-live-inventory.e2e.ts --output=test-results/finalreview-inventory-stable
bun run api:validate
bun run build
```

Focused units: **503 passed**, 4,471 assertions, 42 files. All three TypeScript
projects, strict change validation and whitespace checks pass. The focused real
Hub/Git browser suite passed **8/8**, Chromium/WebKit: all rendered Hub images
resolve on `/`, `/settings`, direct Settings detail and `/clone`, plus retained
Settings; external checkout discovery works for direct, retained A and managed B;
one stream, stable heading/focus, exact draft/task identity, direct stream cleanup
and continued hub-nav invalidations after leaving inventory are asserted.

Production build and API validation pass (only the existing CSS `highlight` and
`WorkspaceConflict.allOf` warnings). The compiled smoke also passed using a new
private HOME under the approved temporary root, `env -i` with HOME/TMPDIR/PATH
and `PLAYWRIGHT_BROWSERS_PATH` pointing to the installed cache, then `bun run
smoke`. It covers auth/assets, document/live delivery, desktop worktree entry and
compiled phone Hub → workspace → Settings → Return without page errors. Local
logs are `.local/finalreview-build.log` and `.local/finalreview-smoke.log`; raw
logs/runtime paths are not committed. No public payload/revision changed.

Self-review against the repository conventions, task 21.3 and supplied defect
report found no additional blocking issue after the stale-read and shared-key
corrections above. No new dependency, endpoint, credential effect or authorization
bypass was introduced. This is author self-review, not independent validation.

Final stable-source browser commands:

```sh
UATU_MOBILE_REVIEW_PORT=4793 bun node_modules/@playwright/test/cli.js test -c playwright.mobile-hub-review.config.ts --output=tests/mobile-hub-review/results/finalreview-matrix
bun node_modules/@playwright/test/cli.js test -c playwright.mobile-live.config.ts --output=test-results/finalreview-live-serial
```

Synthetic: **342/342 passed**, both engines (9.5 minutes). Live, run after the
other browser jobs finished: **74/74 passed**, both engines (3.3 minutes), no
retries or deadline/assertion changes. The existing account/platform/PTY/clone
doubles retain their stated provenance; Git inventory and credential/folder APIs
use disposable real resources. These are not personal-provider/device tests.

The earlier concurrent expanded live run was **70 passed / 4 failed** (9.2
minutes): two Chromium worktree timeouts, a WebKit workspace translation wait
and a pending WebKit OpenPGP generation. All four categories passed in both
engines in the unchanged-deadline isolation command below (**8/8**, 1.4 minutes),
then the complete sequential 74-case run passed. Resource contention is plausible
but not established as each original failure's cause; that failed run remains
recorded rather than relabeled green. Its output is retained at
`.local/finalreview-live-complete.log` and `test-results/finalreview-live-complete`.

```sh
bun node_modules/@playwright/test/cli.js test -c playwright.mobile-live.config.ts --grep 'compact checkout More|exact disclosed|production phone entry retains|phone openpgp' --trace=retain-on-failure --output=test-results/finalreview-failed-isolation
```

No baseline/golden, auth/operator configuration, dependency, archived evidence or
existing live/synthetic service changed. The seven release/manual gates above,
historical Chat-touch failures and archive-digest mismatch remain unwaived.
