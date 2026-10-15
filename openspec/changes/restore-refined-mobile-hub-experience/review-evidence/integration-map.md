# Task 1.3 — scoped same-document integration audit

## Current live integration plan — 2026-10-15

The user explicitly authorized integrating the refined mobile frontend into the
live phone Hub. This updates the historical review-only boundary below, not its
past results. Current-tree source inspection found the following seams; these
are planning observations, not executed live acceptance tests. No separate
change is required: integration was already the proposal's intended next stage.

| Concern | Current source/API seam | Planned integration and acceptance |
|---|---|---|
| Production entry vs reviewer | `src/hub/server.ts` serves `pages.ts` for `/`, `/settings`, `/clone`, and proxies `/s/<id>/`; `tests/mobile-hub-review/browser-entry.ts` alone assembles the coordinator through the review build. | Build a product browser entry using existing workspace markup and `workspaceReady`, without test transport, review meta/globals or xterm instrumentation. Hub-only cold entry has no resident workspace; canonical Open enters `/s/id/`. Eligible workspace entry installs the coordinator before singleton imports, preserving ordinary detours thereafter. Desktop/standalone keeps existing entry behavior. |
| Data adapter | `src/hub/mobile/backend.ts` defines typed reads/intents/results and invalidation; current interface lacks upstream Agent accounts, Notifications and worktree operations. | Add browser-safe named adapters using domain DTOs, validate responses and preserve rejected/indeterminate outcomes. Do not import server execution graphs or add an untyped generic dispatcher. Start with read-only state/catalog/default-folder decoders; no production switch or mutation stubs. |
| State and branch truth | `/api/hub/state` exposes runtime/shells/revisions, assignment-name summaries, `repositoryId`/`parentId`, sparse branch/detached/ownership/availability and `worktreeApi`. `worktree-git.ts:readCheckoutHead()` reads HEAD without Git, returning branch/detached/unknown. | Join full assignments from credential DTOs by id, not display name. Extend bounded facts for detached commit/unborn/non-Git where authoritative evidence exists; never infer a branch from the linked workspace display-name fallback. Preserve unknown and partial shell read failures. No Start or Git subprocess per list row/poll. |
| Auth/CSRF | `server.ts` `/login` form/JSON, `/logout`, gated `/api/hub/sessions` and revoke; `auth.ts` session/cookie/safe-return/rate-limit helpers. State lacks mobile user/host identity. Cookie writes use same-origin checks; bearer native clients keep their current exemption. | Add safe identity to gated state or reuse an equivalent authenticated bootstrap; never fixture identity or anonymous version/workspace disclosure. Do not persist the JSON login's `sessionId` in browser state/history/logs. Test anonymous 401/HTML redirect, bad/rate-limited login, safe next, cross-origin refusal before effects, logout/current-device invalidation and delayed success fencing. No operator auth/config writes. |
| URL and live ownership | `shared/app-url.ts` caches injected base and supplies `hubUrl`; `mobile/coordinator.ts` fixes workspace id/base; `shell/live.ts`, `live-channel.ts`, Hub live endpoint/broker and proxy own SSE/WS. | Workspace `/s/A/` traffic remains fixed behind `/settings`; Hub adapters use `hubUrl`. Retain one brokered workspace stream, subscription ownership, Origin/page-origin/Fetch-Metadata checks and 401/Stop generations. Do not resume retired child stream URLs. Test direct paths, query/hash and native desktop fallback. |
| Repository credentials | `credential-api.ts`, `credential-types.ts`, `credential-context.ts`, server credential/tool/assignment routes and `sessions.ts` coordinated lifecycle. Public DTOs do not currently carry explicit protection/lock/user-ID or saved override facts. | Add safe optional facts from authoritative owners or show unknown; preserve type-specific operations, limits, masking/clearing, host/role semantics, stop-before-mutation, provider CLI projected-session cautions and inherited parent policy/restart-required. Test disposable SSH/OpenPGP/token flows through real routes; no personal keys. |
| Agent accounts | `/api/hub/agent-accounts` read; `/key`, `/login`, `/logout`, `/activate`, `/attempts/:id/{code,redirect,cancel}`; types/field conditions, service, redirect validator and propagation owners. Existing `agent-accounts-pane.ts` is desktop presentation. | Add separate phone Settings group and focused pages, reusing capability/field/attempt contracts rather than copying the global pane. Preserve all OpenCode/Claude methods, env/command guidance, safe redirect refusal, attempt errors/cancel/expiry and machine-wide/all-users warning. Preserve old Chat login links. Verify with `agent-accounts-fake.ts` through real Hub routes; external-provider login remains separately scoped. |
| Notifications | `pwa/notification-client.js:mountNotifications` owns dialog/enrollment and currently injects triggers into Hub navigation; `/api/hub/notifications` serves GET/PUT/DELETE; `notifications.ts`, presence and push worker own behavior. | Extract/adapt presentation mounting for a focused phone Settings page without a third dock trigger or duplicate enrollment owner. Preserve workspace/all-workspaces/event filters, permission/install-needed/unsupported/error states, explicit enable intent and session/device scope. Desktop mount and push/presence behavior remain unchanged. |
| Worktrees/card grouping | `dashboard-groups.ts` builds desktop Active/Inactive groups; `/api/hub/worktrees` plus fetch/create/open/register/forget/preflight-delete/delete, `shared/worktree-contract.ts`, `shell/worktree-dialog.ts`, live reconciler. | Keep desktop unchanged. Phone uses compact one-checkout cards, multi-checkout disclosure, Rename/create in More and scoped task presentation. Reuse authoritative services/contracts and existing operation owner where possible; do not inject global desktop DOM into the mobile root. Preserve HTTP-200 refusals, ignored/local data guards, inherited credentials, identities, independent child runtime and restart-required. |
| Onboarding/lifecycle | Server session start/stop, display-name and registration routes; configure/create, browse/defaults and folder manager; worktree routes when capability is present. | Connect existing typed flows, preserving explicit unassigned/Git-init/stop consent, nested-path coordination, partial stop, retained files/registry and start failures. Tests use isolated disposable repositories; browsing/Back cannot create or start anything. |
| Clone contract gap | Mobile `submitClone`/`reconcileCloneAttempt` expects owner-bound `attemptId`; real `clone-jobs.ts` and `/api/hub/clone-jobs` offer accepted job plus owner-scoped events/input/cancel but no attempt reconciliation contract. | Add serialized owner-bound admission/reconciliation with accepted-job deduplication, conflicting-reuse refusal, fenced nonacceptance and restart/expiry uncertainty. Do not wire clone submit before this exists. Publish additive fields/lookup contract with legacy compatibility; then test stream replay, masked prompt/input/cancel races and partial checkout/registration/start outcomes. |
| Public contract publication | `api/openapi.yaml`, `operations.yaml`, `streaming.yaml`, route/contract tests, `shared/version.ts` revision owners and API docs. | Update together for every wire addition; run API validation/tests and old-client compatibility. No main-spec sync is needed to implement or validate this change. |

### First slice and dependencies

**Apply-entry recheck (2026-10-15, task 17.2):** no unresolved index entries;
staged binary diff SHA-256 remains
`f94afebe6a34c75683c6896ab22c06d98b7402818dbb44506bff4f707b5a569a`.
All five pre-existing unstaged follow-up file hashes match the planning handoff.
The existing planning amendments are retained. No runtime/service/config changes.
Rechecked the source matrix and the current `HubState`, `HubWorkspace`,
`WorkspaceDefaults` OpenAPI schemas plus credential DTO parsers. The first
read-only slice consumes those existing shapes; it does not claim a complete
`MobileHubBackend` or synthesize missing user/host, branch-state, credential-lock
or assignment-id facts. In particular the state list contains credential *names*,
and linked-worktree `branch` can be a fallback label; neither is new authority.

Tasks **17.2–17.3 only** are the recommended first apply slice: preserve/check
baseline, map current API payloads, implement/test read-only browser transport and
decoders for Hub state, credentials and default folder. Verify 401, malformed,
timeout/unavailable and unknown facts, correct Hub scope and no side effects.
No service restart, auth provisioning, public mutation/API extension or live UI
switch is needed to learn whether this seam is sound.

Then 18 establishes authoritative facts, auth, entry and stream ownership; 19–20
add phone/upstream Settings and credential parity; 21 builds lifecycle/onboarding,
worktrees and the clone-reconciliation prerequisite before clone submission.
22 verifies integrated retention and desktop nonregression; 23 is a separately
scoped candidate/deployment handoff, not an automatic publish operation. Do not
enable an incomplete production replacement that drops management operations.

### Evidence and resource boundary

#### First-slice implementation evidence — 2026-10-15

Tasks 17.2–17.3 are complete; this is **self-verification of the bounded read
slice**, not independent review or live/mobile acceptance. Added
`src/hub/mobile/live-read-model.ts`, `live-reads.ts` and their colocated tests.
`createLiveHubReads` exposes exactly three explicit GETs, with injected fetch,
same-origin cookies, no-store, redirect refusal and a whole-response timeout.
It uses `hubUrl()` and the existing public credential parser, preserves omitted
facts, distinguishes HTTP/auth, malformed, network and timeout failures, and
does not retain server error bodies. It neither mounts UI nor offers mutation
stubs, cache, polling or automatic retries. No public API schema was changed.

Verification performed:

- `bun test src/hub/mobile/live-read-model.test.ts src/hub/mobile/live-reads.test.ts`:
  **60 passed**, including unknown facts, assignment-name/id distinction,
  duplicate identity rejection, credential private-field rejection, scoped reads
  during a workspace detour, 401/403/404/429/500/503, malformed JSON/payloads,
  interrupted/stalled bodies, late responses and no retry/mutation behavior.
- `bun run typecheck` and
  `bun node_modules/typescript/bin/tsc --noEmit -p tests/mobile-hub-review/tsconfig.json`:
  **passed**.
- `bun test src/hub/mobile src/hub/credential-types.test.ts src/shell/bounded-fetch.test.ts src/shared/app-url.test.ts src/shared/app-url-discipline.test.ts src/shared/browser-bundle-discipline.test.ts`:
  **359 passed** (includes the 60 new tests).
- `bun run api:validate`: **passed**, with the existing single-schema `allOf`
  warning at `WorkspaceConflict`; `bun test api/contract.test.ts api/route-coverage.test.ts`:
  **29 passed**.
- Existing `auditBundle` checks for `src/index.html`, mobile `coordinator.ts`
  and `live-reads.ts`: **passed**, respectively 1068, 28 and 5 runtime modules.
  The reader's bundle contains only its two modules, `credential-types.ts`,
  `app-url.ts` and `bounded-fetch.ts`; privileged type-only imports are erased.
- Strict OpenSpec validation and tracked/new-file whitespace checks: **passed**.
  Final staged diff digest remains the baseline above; all five pre-existing
  follow-up files remain byte-identical. The earlier planning amendments remain.

No running-Hub requests, browser/device checks, runtime service changes, staging,
commit/push, spec sync or archive were performed. In particular, this evidence
does not certify real cookie/login behavior or production UI mounting. Task 8.3,
the historical Chat failures and archive-digest issue remain open. Next is task
18.1: authoritative branch/checkout and credential/tool facts, with server and
adapter tests; publish contract additions under 18.5 before treating them as
live mobile authority. Full backend assembly and authentication generation
fencing remain subsequent dependencies, not fabricated features of this reader.

- Existing staged uncommitted merge and five unstaged follow-up files are outside
  this planning amendment. Preserve them; never stage unrelated work.
- Current live 8445/4717 and synthetic 8446/4718 services remain untouched. Private
  runtime/auth/host/lifecycle details stay in the existing external handoff, not
  tracked plans. Use separate isolated test resources for later checks.
- Preserve all meaningful tests and historical evidence. The broader Chat touch
  suite's 11 failures and archive-digest mismatch are open and unwaived; a focused
  passing adapter test does not close them. Emulated browsers are not physical
  device/native verification. Task 8.3 remains final visual acceptance, not a
  missing integration authorization.

## Historical frontend-only audit — 2026-09-09

> Current entry points: [evidence index](README.md) and [verification](verification.md). Keep the interface guidance below; its recorded verification and generated-artifact paths are historical at pre-cleanup commit `373ef6350032f6a0f2a91c2037ebafb553bc002f`, not new acceptance.

Audited 2026-09-09 against the preserved dirty-tree baseline. This is an
implementation map, not evidence that continuity already works. References are
to the current working tree; later edits can move line numbers.

## Ownership boundary

One coordinator owns only foreground Hub/workspace presentation, Hub view/scroll
context, modal precedence and route dispatch. `src/shell/state.ts:170–216`
remains the sole workspace state singleton. Document selection, active surface,
File attachments, streams, xterm and preferences retain their existing owners.
Exactly one workspace can remain resident; opening B is the existing document
lifetime boundary. No iframe, replacement client, or serialized attachment state.

## Integration map

| Concern | Existing owner and evidence | Required bounded change | Verification |
| --- | --- | --- | --- |
| Single-shot boot | `src/app.ts:28–90` queries workspace DOM at import time; `:92–138` wires owners and boots. `src/shell/boot.ts:39–181` loads state and starts clients. | Extract a single-shot boot/bootstrap seam, preserving current production default and initialization order. Mount unique workspace markup before importing modules that query it. Do not start workspace boot at a displayed Hub URL interpreted as a document. | Same workspace root/client sentinels and exactly one boot on every round trip. Direct Hub and workspace route loads tested separately. |
| Workspace DOM | `preview/mount.ts:69–77`, view-mode/layout/header/empty/commit-message/anchors/mermaid/diff/outline; `sidebar/shell.ts:25–31`, panes/search-pane/tree-mount/files-filter/git-log/change-overview; `find/find-bar.ts:19–34`; `terminal/panel.ts:234–273`; `chat/surface.ts:186–189`. | Retain one uniquely identified workspace root; scope all new Hub queries/IDs locally. Inject/scoped-query existing owners only where actual coexistence requires it. Avoid a parameterized multi-workspace rewrite. | No Hub update selects/replaces workspace DOM. Current interiors remain unchanged. |
| CSS and measurements | `styles.css:190–206` owns body overflow/height; touch rules at `:6993–7004,7275–7287,7303–7326,7378–7404` depend on global mode/tab attributes. | Strict Hub-root CSS and one foreground attribute; preserve workspace measurements when inactive. Set inactive root inert/aria-hidden without assuming whole-root `display:none` is safe. No generic Hub body/main/button/row/pane rules. | Hidden root cannot receive input/accessibility focus; terminal rows/columns and surface scroll do not reset. Desktop/native inset comparisons. |
| Stable request base | `shared/app-url.ts:14–27` caches injected meta; `:35–59` builds/decodes URLs. `shell/boot.ts:55–65`, `shell/events.ts:97–103` already use it. `hub-nav.ts:66–79,193–196` derives identity from it. | Bind workspace meta before imports/boot; never reset it on `/settings`. Hub interface uses explicit origin routes, not workspace `appUrl()`. Do not rewrite document base. | HTTP/SSE/WS remain `/s/A/...` while displayed route is Hub; managing B never retargets A. |
| History partition | `shell/history.ts:118–235` currently handles all popstate; transient interceptors at `:125–149`; canonical workspace writes at `:37–77`. Boot parses URL and replaces history at `shell/boot.ts:39–48,77–149`. | Refactor one dispatch seam before document selection, not a racing second listener. Hub routes/detail contexts go to coordinator; A routes delegate existing document/hash/commit logic; B uses full navigation. Preserve existing workspace history fields alongside namespaced coordinator context. | Back/Forward and direct loads, independent Hub scroll, hashes and commit queries; no false document load, Follow change, or implicit Start on Hub history. |
| Hub links and Return | `shell/hub-nav.ts:184–209,222–289` wires navigation; BFCache handling at `:315–355`. `shell/tab-bar.ts:369–378` gives touch Hub its href. | Intercept only eligible touch Hub navigation, retain canonical href fallback and desktop behavior. Ask existing selector owner to expand on Return; never set active tab to Preview. | All four surfaces preserved; fresh/visited/renamed/duplicate/stopped/missing Return, manage B then Return A. |
| Selector ownership | `shell/tab-bar.ts:17–28,40–79,134–399,401–466` owns ready state, active tab, placement and idle timing. | Gate its global handlers by foreground/modal context; expose narrow reveal method rather than another timer/tab state. Preserve seven-second and held-input policy. | No hidden selector competes with Hub dock/sheet; Return expansion does not steal focus. |
| Find shortcuts | `find/shortcut.ts:108–165` capture shortcuts/Escape; native bridge at `:177–209`. | Gate workspace shortcuts and native bridge at existing owner when Hub/sheet foreground. | Hub form typing, Cmd/Ctrl-F, Shift-Cmd-F, Cmd-G and Escape cannot activate hidden find/search. |
| Interaction tracking | `find/active-surface.ts:141–173` globally tracks pointer/focus. `tab-bar.ts:290–339` globally handles pointer/focus/input/key/blur/visibility. | Ignore non-workspace events when inactive; Hub focus must not rewrite workspace active-surface state or selector policy. | Hub forms do not change selected workspace surface or attention acknowledgement. |
| Other global shortcuts | `terminal/panel.ts:1811–1875`; `preview/outline.ts:760–792`; `hub-nav.ts:379–393`; temporary Chat agent-menu capture listener `chat/ui.ts:2332`. | Gate through existing owner and modal precedence. Inert alone is insufficient for document listeners. Close/restore focus only within current foreground context. | Escape, terminal toggle/split and ordinary typing produce no terminal bytes, hidden overlay activation, or focus steal. |
| Async state and focus | Preview generation checks `preview/mount.ts:79–88,117–161`, `load-generation.ts:23–39`; SSE channel generation `shell/events.ts:97–117`; Chat conversation checks `chat/ui.ts:3030–3043,3082–3119,3225–3229,3280–3288,3374–3452`. | Preserve background state updates; gate presentation/focus effects. Coordinator auth/workspace generations prevent invalidated protected roots from resurfacing. Do not replace existing document/conversation ownership checks. | Delayed responses while Settings active cannot replace its view/focus; stale 401/revoke/Stop/removal completions cannot restore retained access. |
| Focus entry points | Chat restored-draft focus `chat/ui.ts:3062–3068`; Terminal deferred focus `terminal/panel.ts:920,1128,1524,1654–1662,1953–1959`; find open/close `find/find-bar.ts:260,296,318`; search `sidebar/search-pane.ts:385–414`. | Check current foreground after awaits/deferred callbacks. Capture outgoing-root focus deliberately; sheet dismissal restores only a still-valid trigger in current context. Return does not focus selector. | Complete pending operations during a Hub form/sheet; focus stays with active task. |
| Chat lifetime/activity | Pending File/staging ownership `chat/ui.ts:3046–3068,3233–3335`; pagehide disposal `:3474–3499`; visibility predicate/observers `:3823–3876`. | Add foreground to existing activity predicate/observer, not document visibility spoofing. Preserve uploads/streams/maps; pause only inactive rendering/read acknowledgement. Ordinary detour must never emit teardown/pagehide. | Exact File object and draft identity, continuing upload/stream, one request/transport; no reconstructed filename substitute. |
| Geometry and scroll | Terminal resize/reveal/refit `terminal/panel.ts:1753–1761,1930–1958`; UI-mode resize `shell/ui-mode.ts:97–104`; tab viewport/ResizeObserver `tab-bar.ts:204–225,329–339`; preview outline/file-navigation/mermaid and Chat/terminal viewport helpers. | Capture existing surface anchor before foreground change, suppress zero-size terminal fits, reconcile once after visible geometry returns. Preserve Hub scroll separately from existing surface owners. | Output during Hub detour, changed viewport/keyboard, terminal geometry and all surface scroll positions preserved on Return. |
| UI mode and preferences | `shell/ui-mode.ts:56–119`; `state.ts:203–210` and `tab-bar.ts:40–79`; anti-flash `index.html:15–59`; `navigation-preferences.ts:10–18,40–71`. | Read eligibility without overwriting mode/tab. Sheets use existing preference setter and draft/Cancel/Done; preserve one-time authenticated Hub-scope promotion and storage fallback. Explicit mode escape retains existing desktop/standalone defaults. | Cancel/no-op/Done, cross-tab update, storage denial, live mode switch; no semantic preference leakage. |

## Initialization and event ordering

1. Assemble scoped Hub and unique existing workspace roots; establish the retained
   workspace request context before importing workspace modules.
2. Preserve existing initialization order: mode/tab stamps, interaction/find and
   sidebar/preview owners, token/PWA/history, then workspace load and Chat ready.
3. Route dispatch identifies Hub versus workspace before document selection runs.
   A blocking sheet has interaction precedence over either foreground root.
4. A detour captures surface anchors, makes workspace interaction inactive, and
   reveals Hub without teardown. Background operations retain their owners.
5. Return restores geometry/scroll and asks the existing selector to expand.
   Authoritative auth/workspace invalidation overrides this path.

## Boundaries and risks (not implementation completion)

- `src/hub/pages.ts` emits a document-global inline controller. Injecting it is
  unsafe; the planned reusable mobile modules/interface must replace that approach
  only in the isolated review entry, not wire live operations in this stage.
- Singleton base/state/DOM assumptions are compatible with the authorized one
  retained workspace. Multiple resident workspaces would require a materially
  larger redesign and remain explicitly out of scope.
- Global workspace layout and import-time queries warrant targeted coexistence
  fixes. A wholesale root-parameterization/CSS rewrite is not selected here.
- New live auth, credential, filesystem, branch-probing and transport adapters
  remain deferred. Existing owners are audit evidence, not permission to invoke
  privileged services. Synthetic invalidation is not live authorization proof.
- Browser process eviction/reload and cross-workspace replacement remain real
  lifetime boundaries; ordinary detour preservation cannot guarantee survival.

Every required coexistence concern has an existing feature owner above. The
coordinator is a new presentation seam, not a second workspace singleton. Tests
listed above are prospective acceptance checks; this audit ran no browser,
provider, shell, server, credential tool, or live backend operation.
