## 1. Reference and frontend contract foundation

- [x] 1.1 Record the current dirty-tree baseline and map the retained reference images to normalized CSS viewports, states, and branding exceptions in a review-evidence index; verify that original reference files and existing user changes are not overwritten.
- [x] 1.2 Define the reusable frontend backend interface using existing credential, assignment, clone, workspace, and readiness types plus explicit branch-state values; verify type checks and colocated tests reject impossible or ambiguous operation states without importing mock fixtures into product code.
- [x] 1.3 Audit the workspace boot, URL/base-path cache, global key handlers, focus, and visibility/resize owners needed for same-document coexistence; deliver a scoped integration map and verify each required change has an identified existing owner rather than a second state singleton.
- [x] 1.4 Add the approved frontend-only explicit credential protection/lock, OpenPGP user-ID and saved tool-override facts; populate synthetic states and verify truthful current-value presentation without inferring facts from diagnostic prose or changing live/public APIs.
- [x] 1.5 Add the approved clone submission-attempt identity and authoritative reconciliation seam; verify authenticated ownership, reload hints, accepted/not-accepted/pending/expired outcomes and no duplicate submission or uncertainty loss through navigation/discard.

## 2. Isolated mocked-backend review runtime

- [x] 2.1 Add a test-only review launcher that bundles the intended product frontend and serves only approved assets/fixtures on loopback; verify health/start/stop behavior and traversal/unrelated-file rejection without starting the production Hub, credential tools, providers, or PTYs.
- [x] 2.2 Implement typed synthetic Hub reads and operations for auth, workspaces, metadata, preferences, credentials, devices, and onboarding; verify fixture reset and mutation logs affect only test-owned state and unknown requests fail rather than falling through or returning generic success.
- [x] 2.3 Supply protocol-compatible workspace corpus/render, Chat/attachment, and Terminal stream doubles for the real clients; verify the actual surface clients boot, render synthetic content, and can hold/settle a pending upload without invoking an executable shell or provider.
- [x] 2.4 Add a separate test-owned scenario controller with stable fixture clocks and pending/failure/stream controls; verify simulation warnings, no-real-credentials guidance, independent synthetic session state, and absence of review controls from the product viewport/bundle.

## 3. Reference-faithful core mobile frontend

- [x] 3.1 Create scoped mobile visual primitives for current branding, grouped surfaces, contextual icons, action capsules, docks, and bottom sheets; verify they reproduce representative reference geometry/materials and do not alter workspace or desktop styles.
- [x] 3.2 Implement the actual dashboard composition with host/count context, Running/Ready to start groups, folder/branch/ellipsis rows, Open/Start, workspace information, and Add Workspace; verify visual/structural assertions catch the previous text-only icons and generic panel hierarchy, including long/duplicate names and branch variants.
- [x] 3.3 Implement the grouped Settings identity/credential/workspace/account overview with focused destination views rather than inline administrative forms; verify it matches the reference screen composition and all screen-map destinations are reachable.
- [x] 3.4 Implement Hub/Settings icon-and-label docks and distinct two-line Return presentation using validated stable workspace identity; verify fresh/visited/renamed/duplicate/stopped/missing cases and management of B never retargets A.
- [x] 3.5 Implement the Preview-side, handle-placement, and navigation-dismissal sheets against the existing preference owner; verify current-value initialization, draft/Cancel/Done behavior, keyboard/backdrop focus handling, storage fallback, and no semantic preference leakage.

## 4. Same-document continuity vertical slice

- [x] 4.1 Assemble scoped Hub and existing workspace roots with one workspace boot and no iframe; verify dashboard -> workspace -> Hub -> Settings -> Preview-side sheet -> Return keeps the same workspace/client sentinel on all four surfaces and does not force Preview.
- [x] 4.2 Partition canonical Hub/detail and workspace history dispatch while keeping workspace service base path fixed; verify Back/Forward, direct route load, file/hash/commit-query restoration, Hub scroll, and no history-induced Start or false document selection.
- [x] 4.3 Gate inactive-root shortcuts, focus, pointer handling, and visible navigation through their existing owners without disposing background work; verify typing in Hub forms does not reach Terminal or hidden find/chat handlers, and hidden-root geometry does not reset terminal sizing or scroll.
- [x] 4.4 Preserve exact pending Chat File/draft ownership, synthetic upload progress, Chat stream state, and the real terminal client across Hub detours; verify one request/transport and continuing output, not reconstructed filenames or a fake surface.
- [x] 4.5 Implement foreground invalidation and stale-response generation guards for synthetic 401/revoke/sign-out/Stop/removal; verify protected retained content cannot reappear, stopped history remains truthful, and desktop/standalone entry and live mode escape remain unchanged.

## 5. Complete mobile flows and reviewed extensions

- [x] 5.1 Implement login, identity, loading/empty/unavailable views and contextual retry using the reference grammar; verify no unauthenticated workspace/version disclosure and representative light/dark/keyboard states are included in the review evidence.
- [x] 5.2 Implement credential catalog, chooser, SSH detail and applicable generate/import/public/unlock/lock/enable/disable/test/delete sheets; verify mocked intent sequences, masking/clearing, import-source/size validation, cancellation, and contextual failures match existing semantics.
- [x] 5.3 Extend credential details/tasks to OpenPGP and HTTPS/provider tokens plus tool-readiness/override views; verify only supported operations are offered, missing/incompatible tooling is actionable, and stored secrets never reappear.
- [x] 5.4 Implement workspace assignment/default editors and default-folder flow in grouped detail/sheets; verify current versus assign-new intent, separate auth/signing and host scope, no-op edits, review/back drafts, stop-dependency cancellation/failure, and fallback explanations.
- [x] 5.5 Implement workspace menus, rename/Stop/Forget states, devices, current-session revoke, security explanations and sign-out presentation; verify distinct destructive language, focus recovery, synthetic partial failures and preserved existing authorization/operation ordering.
- [x] 5.6 Implement Add Workspace, folder browse, existing-repository configuration, create/rename/remove-folder and registration flows; verify display/folder identity, explicit Git-init consent, nested-registration and collision/error states using only synthetic effects.
- [x] 5.7 Implement clone options, independent unlock recovery, streamed progress/input/cancel and each terminal/partial outcome; verify unchanged non-secret drafts, one explicitly authorized submission, any-prompt masking, retry/reconnect and truthful retained-workspace/checkout outcomes.

## 6. Workspace chrome and cohesive motion

- [x] 6.1 Align workspace selector/handle and Preview pill materials, icon strokes, spacing and state colors with the reference while preserving current interiors; verify all named expanded/collapsed/Terminal/left-right/boundary/error states in the reference contract.
- [x] 6.2 Implement the same-document workspace/Hub reveal and Return transitions with preserved scroll and interruptible input; verify no animation-driven remount or focus steal, reference selector fade behavior, and immediate reduced-motion alternatives.
- [x] 6.3 Reconcile the complete `screen-map.md` inventory with implemented routes/scenarios and classify every unpictured extension or unresolved visual deviation; verify there are no silently omitted actions, fake success placeholders, or unexplained UI exceptions.

## 7. Frontend acceptance evidence

- [ ] 7.1 Add deterministic feature-named visual regression coverage and retained reference/actual comparison evidence; verify a deliberate icon/hierarchy/material regression fails and document normalization, branding/data substitutions, comparison tolerances, and any masks instead of blessing mismatches.
- [x] 7.2 Exercise the full core and exceptional review flows in installed Chromium and WebKit at phone/tablet touch sizes, short landscape, 200% text, keyboard and reduced/contrast preferences; verify the scenario report names actual passes, failures and untested states without claiming physical-device or live-backend validation.
- [x] 7.3 Run focused unit/E2E regressions for changed workspace, navigation, form and preference owners plus type checking and production-bundle separation checks; verify no fixture/server/scenario-control imports enter shipping code and record exact commands/results.
- [ ] 7.4 Compare fine-pointer desktop/native-inset presentation and unchanged workspace interiors against pre-change evidence; verify no global CSS/event/route leakage and account explicitly for intentional overlay changes rather than deleting assertions.

## 8. Serve for user review and record acceptance

- [x] 8.1 Launch the isolated mock review on unused loopback/Tailscale HTTPS ports and leave existing Hub/test/reference services intact; verify local readiness and remote phone access, then provide exact scoped start/stop/restart/reset commands and simulation credentials/instructions without personal secrets.
- [x] 8.2 Deliver the frontend review URL, reference/actual evidence, complete scenario guide, unpictured-state designs, known gaps, and an acceptance record marked awaiting user review; verify the handoff explicitly distinguishes mocked behavior from live backend correctness.
- [ ] 8.3 Obtain and record the user's explicit final visual and interaction acceptance of a named served version and enumerated exceptions; verify the acceptance record identifies the actual version and reviewer decision. **Leave unchecked:** the 2026-10-15 design-direction agreement and explicit live integration authorization supersede this task's former integration stop, but do not certify rendered states, approved goldens or physical devices. Passing tests cannot complete this acceptance task, authorize rollout, spec sync or archive.

Originally live integration tasks were deliberately excluded. The user has now
authorized the scope amendment below; the lead starts apply after planning.
Sections 1–16 preserve historical completed work and pending evidence; their
past review-only publication boundaries are not new integration prohibitions.
Keep production-facing delta specs unsynced until implemented and verified.

## 9. User-requested iOS UX and one-handed correction

- [x] 9.1 Research official Apple iOS HIG and Uatu API semantics, reproduce the folder/readiness symptoms with deterministic failing checks, and audit all 27 screen families without treating screenshot capture as UX approval.
- [x] 9.2 Implement shared lower-screen task navigation and primary-action placement with one natural home per action; verify no duplicate Back/Add/commit controls and safe dock, text and keyboard clearance.
- [x] 9.3 Replace oversized folder/action stacks with compact grouped hierarchy rows and contextual secondary commands; verify all folder/configuration/creation/error/partial-result operations remain reachable and truthful.
- [x] 9.4 Replace flat readiness/tool walls with useful outcome/blocker summaries and complete progressive diagnostics; verify explicit facts, action reachability and no invented or discarded API information.
- [x] 9.5 Reconcile workspace, credential, assignment, device, security and clone menus/forms with the same one-handed patterns; eliminate duplicate cancellation paths while preserving drafts, confirmations and asynchronous ownership.
- [x] 9.6 Re-run the complete option/scenario and regression matrix in Chromium/WebKit with small/large/keyboard/text/accessibility cases, and retain before/after UX evidence and named limits.
  - The previously verified matrices and subsequent corrections are reconciled with current80a2e3d live before/after/reference captures in `review-evidence/deployment-verification.md` and the approved source geometry record. Earlier responsive style hashes remain historical, not a fresh pass for changed CSS. This completes the machine matrix/evidence deliverable, not approved goldens, human acceptance or missing historical/native baseline obligations under 7.1/7.4/8.3/22.3.
- [x] 9.7 Update the versioned handoff and approval record, refresh only the isolated review candidate, verify it, and stop for renewed user visual/interaction review without live integration.

## 10. Settings convention refinement and workspace cold entry

- [x] 10.1 Restore conventional iOS Settings navigation/contextual editing, remove blanket bottom commands and single-option menus, clarify Hub-wide folder behavior, and preserve draft/Cancel/Save semantics without duplicated controls.
- [x] 10.2 Present credential purpose and understandable local availability first, explain secondary troubleshooting and each tool's role, retain all diagnostics, and preserve capability/secret/operation semantics.
- [x] 10.3 Reproduce and repair cold-entry handle/selector presentation, provide loading Back to Hub, fence inactive shortcuts and late boot completion, and preserve saved Files/placement/URL and first-frame Hub availability.
- [x] 10.4 Complete current Chromium/WebKit integration, responsive and cold-entry verification; retain exact test results and keep blocked checks open rather than inheriting an older green matrix.
- [x] 10.5 Publish the versioned isolated review refinement with its evidence and outstanding verification clearly identified, then request renewed user review without live integration.

## 11. Direct Settings and full-page editors

- [x] 11.1 Replace drawer task presentation with one shared full-page editor/result owner and explicit centered consequential confirmations; preserve focus, cancellation, secret clearing and safe history without duplicate controls.
- [x] 11.2 Expose applicable Settings/management actions directly, remove generic More menus and option accordions, keep folder rows compact, and preserve every supported operation and confirmation order.
- [x] 11.3 Remove diagnostic panels from normal Settings; provide concise explicitly requested check results and a complete named report view, with readable long metadata values and no repeated check on report Back.
- [x] 11.4 Complete current cross-engine editor/confirmation/history/operation/continuity verification and current visual evidence; keep failed or blocked checks explicit rather than inheriting older passes.
- [x] 11.5 Publish the isolated page-based candidate and updated evidence/acceptance record, then stop for user review without live integration.

## 12. Readable information and explicit controls

- [x] 12.1 Commit and push the pre-refinement checkpoint to the fork before starting new UX work; exclude private runtime data, the separate worktree, unrelated tooling deletions and raw generated traces.
- [x] 12.2 Revisit official Apple guidance, reproduce automatic focus/false-selected action styling, and identify semantic information, notice placement and duplicate navigation problems.
- [x] 12.3 Implement labeled purpose/workspace/review facts, canonical Devices navigation, a prominent dismissible notice, and accurate normalized Current / After applying review without changing operation safeguards.
- [x] 12.4 Implement accessible green Boolean switches, distinct editable/disabled field affordances, and heading-only editor entry focus; preserve defaults, radio semantics and draft-only changes.
- [x] 12.5 Verify current focused regressions and visual examples, publish only the isolated review with exact evidence/remaining limitations, and leave new UX work uncommitted pending a separate request.

## 13. Shared Uatu Web design system

- [x] 13.1 Define and document the compact semantic design-system contract, preserving current user decisions and desktop/workspace-interior scope.
- [x] 13.2 Consolidate shared tokens and authoritative recipes, centralize stateless primitives, and migrate real callers without changing operation or lifecycle ownership.
- [x] 13.3 Add a separate local-only reference page using actual product modules, with explicit asset serving, bundle separation and representative state/interaction tests.
- [x] 13.4 Verify current focused regressions and reference states, record remaining browser/visual limits, and publish only the isolated review with renewed approval pending.

## 14. Focused Hub folder selection

- [x] 14.1 Research official Apple directory/file-selection guidance and distinguish remote-folder selection from the existing management capabilities and caller contracts.
- [x] 14.2 Implement a read-only full-page picker with persistent Cancel/Choose header, verified path selection, hierarchy navigation, loading/empty/error recovery and preserved caller drafts; move maintenance to explicit Manage folders without dropping operations.
- [x] 14.3 Add the actual picker to the reference catalog and verify current selection/Cancel/hierarchy/readonly/long-list workflows in Chromium and WebKit, plus focused unit/style checks and retained evidence.
- [x] 14.4 Publish the focused-selector candidate and updated guide/evidence, retaining the existing full-app and human approval gates without live integration.

## 15. Preview examples and recognizable Hub controls

- [x] 15.1 Record the user's approved scope and official Apple button/empty-state guidance, explicitly preserving workspace interiors, chrome and Hub/workspace transition/lifetime boundaries.
- [x] 15.2 Expand synthetic workspaces with linked Markdown/AsciiDoc examples, local images, diagrams, code, tables and nested files through the real rendering path; verify routing, isolation and actual browser preview interactions.
- [x] 15.3 Apply shared primary/secondary/destructive buttons and composed empty states across applicable mobile Hub flows; verify the Configure new workspace caller, truthful folder-only empty copy, loading/error distinction, accessibility states and no operation/ownership changes.
- [x] 15.4 Verify current focused cross-engine workflows and retained workspace boundaries, publish the isolated review with new evidence/identity, and leave the existing full-app and human approval gates open.

## 16. Creation exit, Session Security and preview sibling recovery

- [x] 16.1 Commit and push the existing preview/control refinement to the fork before beginning the new corrections, excluding unrelated deletions, private state and raw run artifacts.
- [x] 16.2 Remove the canceled-creation landing page and make Add Workspace the safe exit; move the sole Devices entry into Session Security while preserving counts, direct routes, nested drafts, history and authorization semantics.
- [x] 16.3 Reproduce the screenshot's stale file-index failure and repair the synthetic freshness contract; verify same-directory arrows across all represented file kinds, boundaries, retries, reset/resume and canonical workspace request scope without redesigning the workspace.
- [x] 16.4 Run current focused cross-engine and retention regressions, retain new evidence and publish only the isolated reviewer for renewed user review; preserve older full-app/approval gates.

## 17. Authorized integration foundation — bounded first slice

- [x] 17.1 Record the 2026-10-15 agreed live phone design and integration authorization separately from final visual/device acceptance; verify proposal/design/specs/tasks and existing reference/screen/integration/acceptance plans agree, without marking 8.3 or prior verification gaps complete.
- [x] 17.2 Recheck the working-tree/index baseline and actual API/interface matrix in `review-evidence/integration-map.md` at apply entry; verify all upstream operations, fact gaps, auth/CSRF boundaries and dependency owners are named, with staged merge and five existing follow-up files preserved and no runtime changes.
- [x] 17.3 Implement only browser-safe live read transport/decoders for authenticated Hub state, repository credential catalog and default-folder data, using existing routes and injected test fetch; verify typed available/unavailable/401/malformed/timeout outcomes, unknown facts rather than guesses, `hubUrl()` scope during `/s/A/` navigation, no mutations/automatic retries and no test/runtime imports in the shipping graph. Do not mount the production replacement or expose incomplete mutation stubs in this slice.

## 18. Live contracts, authentication and entry routing

- [x] 18.1 Add bounded authoritative branch/checkout facts and safe explicit credential/tool facts where existing DTOs cannot represent the mobile contract; verify named/detached/unborn/non-Git/unavailable, stopped/no-start, absent tools, protected/unprotected/unknown and saved-vs-effective override cases through server/adapter tests without secret disclosure or Git-per-poll fanout.
- [x] 18.2 Implement live authentication/device adapters through existing login/logout/session routes and safe gated user/host identity facts; verify valid/invalid/rate-limited login, safe next targets, no anonymous identity/version disclosure, cookie-only browser session handling, revoke current/other device, no-store, sanitized errors and generation fencing. Test cookie CSRF refusal, native bearer compatibility and no session id in storage/history/logs; do not change operator auth configuration.
- [x] 18.3 Assemble eligible touch Hub routes and the one-workspace production coordinator entry, retaining desktop/standalone defaults; verify direct/reloaded `/`, `/settings?detail=…`, `/clone`, `/s/<id>/file?…#…`, cold loading/Back, canonical Open, mode escape and fallback routes using isolated test assembly. Do not ship the replacement before all parity dependencies pass.
- [x] 18.4 Bind workspace HTTP/WS/brokered live transport to its fixed base path and map auth/workspace invalidation to the coordinator; verify one stream/boot, current-session revoke/401 and delayed response fencing, stop/removal and reconnect while Hub is foreground, including proxy Origin/page-origin and cross-site stream checks. Do not treat network failure as an authoritative Stop or revive retired child SSE endpoints.
- [x] 18.5 Publish every new wire field/operation from this section in OpenAPI, operation/stream inventories and relevant docs, with revision compatibility decisions; verify `bun run api:validate`, `bun run test:api`, route coverage and old-payload/client compatibility. Repeat this check for later clone additions, not only this initial batch.

  The initial 18.1 batch left this task open for later identity/auth/routing and
  clone additions. Those contracts are now published at Hub/workspace revisions
  14/24 and verified; see `review-evidence/live-entry-verification.md` for current
  commands/results and `review-evidence/live-facts-verification.md` for the initial
  contract choices, limitations and lead-confirmed independent approval. That
  initial approval does not certify the later assembly. Source commits do not
  authorize a running-service update or push.

## 19. Phone composition and upstream Settings parity

- [x] 19.1 Implement compact single-checkout cards and multi-checkout disclosure using authoritative family/checkout identities; verify mixed running/stopped, missing/replaced, duplicate/long names, branch unknown/detached and refresh-stable disclosure with one Open/Start per eligible checkout. Rename and create branch/worktree belong to accessible More actions, not permanent primary card buttons; desktop grouping stays unchanged.
- [x] 19.2 Add focused Notifications Settings using existing enrollment/PWA owners; verify enable/disable, granted/denied/default/unsupported/install-needed/error states, device/session scope, no permission prompt until explicit intent, unchanged presence/attention behavior and exactly Hub/Settings persistent dock destinations plus contextual Return.
- [x] 19.3 Add separate Agent accounts Settings group and focused agent/provider/attempt pages against published capabilities/field definitions; verify OpenCode generations and Claude status, search/selection, key/login/device/code/redirect flows, conditional/secret fields, cancel/expired/failed/retry, activate/logout and unavailable agent states using existing fake-service fixtures plus real Hub routes. Verify machine-wide/all-users warning, safe redirect refusal, no echoed secrets and propagation to running workspaces. No personal or paid provider login is implied; report real-provider testing separately.
- [x] 19.4 Relocate the phone sharing advisory to Credentials with accessible full safety details in credential/assignment/clone flows and retain the separate Agent accounts scope warning; verify all same-UID/runtime-file/shared-agent/configuration-bypass facts, per-user advisory dismissal, persistent access to full details and consequential confirmations. Preserve desktop advisory placement and direct full-page Settings actions rather than introducing generic Settings More menus.

## 20. Repository credentials and tools live adapters

- [x] 20.1 Connect SSH/OpenPGP/HTTPS and GitHub/GitLab CLI token catalog, generate/import/public-key/test/enable/disable/delete and applicable lock/unlock to existing credential APIs; verify supported-operation matrix, file/paste exclusivity and pre-read size limit, secret masking/clearing, local-vs-remote readiness and sanitized contextual errors with disposable credentials only.
- [x] 20.2 Connect tool saved overrides/readiness and workspace authentication/signing assignments; verify accurate current values, host normalization, no-op/omitted-role preservation, inherited child policy, unavailable credentials and credential-restart-required states. Test coordinated stop success/partial failure/cancel before catalog mutation; never infer projected provider-token users from current assignment rows.
- [x] 20.3 Verify credential/agent-account presentation together through focused Chromium/WebKit live-route tests and contract tests: repository credentials cannot silently become agent logins, unknown facts remain unknown, full diagnostics remain reachable, redirects/secrets cannot enter history and rejected/indeterminate writes cannot display success or auto-retry.

## 21. Workspace lifecycle, onboarding, worktrees and clone

- [x] 21.1 Connect Start/Stop/Rename/Forget with existing session/registry services; verify no-assignment confirmation, inherited assignments, all-required-unlocks then one authorized Start, disabled/unavailable refusal, restart-required, Stop shell termination warning, partial results and Forget preserving files. Back/Return never starts a stopped checkout.
- [x] 21.2 Connect remote browsing/default folder/existing registration/create and folder maintenance; verify explicit Git-init consent, separate folder/display names, collisions/path validation, nested registrations, coordinated-stop failure, cancellation/drafts and retained-path/registration/start-failure recovery in isolated temporary repositories.
- [x] 21.3 Reuse upstream worktree API and operation ownership for inventory/refs/fetch/create/open/register/forget/preflight-delete/delete; adapt presentation only through the mobile task owner. Verify HTTP-200 refusals, stable checkout identity, inherited credentials, external/owned/missing/replaced paths, active sessions, dirty/untracked/ignored/local data, exact confirmations, no force bypass, branch/path collisions, operation ids and live inventory refresh. Keep single-checkout card compact and desktop dialog behavior intact.

  Final-review correction over `4ddb012` supplies the formerly missing inventory
  invalidation consumer and production observer lifecycle. New real-Git browser
  checks cover direct inventory, retained A and managed B without a second stream;
  unit regressions cover burst/stale/error/auth and editor/departure ownership.
  See `review-evidence/live-entry-verification.md` for exact current commands,
  results and the bounded cross-workspace reconciliation behavior. This fixes a
  defect in the completed task, not a new acceptance or deployment approval.

  Renewed review found cached inventory on editor Cancel/detail Back after missed
  invalidations. This task was reopened until the resume correction passed:
  both paths now re-read through the existing guarded owner. Eight new unit
  regressions failed before the fix; the focused repeat passes 169 tests and
  the production Chromium/WebKit inventory suite passes 10/10, including real
  changes during both detours. See the renewed-review section of the same
  evidence record. No broad prior result or reviewer approval is newly inferred.
- [x] 21.4 Implement owner-bound clone attempt admission/reconciliation before wiring submit; verify duplicate same-attempt returns original job, conflicting reuse is refused, concurrent requests and lost responses cannot create two jobs, fenced not-accepted cannot later execute, and pending/expired/unavailable/restart recovery never permits blind resubmission. Publish additive API/retention semantics and test legacy callers without attempt ids, auth/CSRF and cross-owner rejection through API contracts.
- [x] 21.5 Connect clone submit/events/replay/input/cancel to real job owners after 21.4; verify separate clone identity vs retained assignments, unlock without unauthorized submission, all prompts masked, one accepted job through detours/reload hints, lost acceptance reconciliation, disconnect/replay and cancel/finish race. Exercise success, retained checkout, failed registration/start/cleanup and expired job in isolated fixtures, preserving all authoritative partial facts.

## 22. Live continuity and nonregression acceptance

- [x] 22.1 Verify live Hub A → Settings/details → A on Files/Preview/Chat/Terminal with exact DOM/client/boot identity, selected document/query/hash/surface, scroll, draft and File objects, pending upload/stream progression and terminal geometry; test hidden input isolation, late focus, Back/Forward, manage B without retargeting A, and explicit B/reload/invalidation boundaries. Use real Hub routing with deterministic test provider/PTY where needed; label doubles rather than claiming external-provider evidence.
- [x] 22.2 Run focused real-Hub API/auth/credential/agent-account/worktree/lifecycle tests and Chromium/WebKit browser suites plus both TypeScript projects and production build; verify frontend bundles contain no fixture/scenario/controller or privileged server modules and synthetic requests still fail closed. Keep browser suites separate from fixed-port unit runs and do not claim a blocked/partial matrix is green.
- [ ] 22.3 Compare phone composition in light/dark, 320/390 portrait, short landscape, touch tablet, enlarged text, keyboard/safe areas and reduced preferences with agreed references; retain named before/after evidence. Recheck fine-pointer desktop/native inset, desktop Hub actions and workspace interiors/standalone against pre-integration baselines; preserve tests and record intentional phone-only differences. Actual native/physical-device checks remain explicitly untested until performed.
  - Current live/reference/retained-responsive comparisons, desktop inset and standalone checks are delivered in `review-evidence/deployment-verification.md`. Exact historical dirty-tree four-interior/native baselines and physical/native checks remain unavailable/unperformed; task stays unchecked.
- [x] 22.4 Reconcile all task evidence, including still-open 7.1/7.4/8.3/9.6/10.4/11.4 and the broader Chat touch 11 failures and historical archive-digest mismatch; verify no golden/baseline/assertion was weakened or unrelated failure waived. Report unresolved release blockers to the lead instead of broadening fixes silently.

  Current reconciliation: 10.4/11.4 are complete with current cross-engine
  results/captures; 7.1/7.4/8.3/9.6 and 22.3/23.1/23.2 remain open. See
  `review-evidence/live-entry-verification.md` for the 93/100 checkpoint, exact
  evidence, retained failures and required lead decisions. No historical failure,
  pixel baseline or physical/native check is waived by this status update.

  The lead subsequently assigned bounded diagnosis/correction of the eleven
  Chat-touch failures in 22.4, without authorizing Chat redesign or historical
  baseline changes. The fresh run reproduced all eleven: eight obsolete automatic
  bar-reopening expectations, two old reserved-gutter setup waits, and a pinned-day
  fixture whose requested scroll exceeded the new full-height timeline's range.
  Explicit navigation helpers and sufficient trailing fixture content preserve
  the original answer/follow/scroll and exact pinned-reply assertions. The first
  complete corrected serial run and original-command repeat each pass 37/37;
  shared-navigation verification is recorded separately in
  `review-evidence/live-entry-verification.md`, not inherited as green.
  That additional suite is 54 pass / 5 fail / 1 existing platform skip: two exact
  Terminal-color mismatches, two legacy Settings-selector waits, and one WebKit
  unavailable-Terminal failure whose cause is not established. These remain
  unwaived for separately scoped follow-up; none of their assertions was changed.
  The archive mismatch and all seven release/manual gates remain separate.

  The lead then explicitly assigned those five navigation cases. Correct label
  targets and focused Settings editors preserve the original checks. A saved-
  document repro established that the unavailable-Terminal double missed queried
  state reads; pathname matching now covers the actual boot with unchanged
  deadlines, disabled/fallback/keyboard assertions and no PTY creation. Corrected
  editor setup also exposed a genuine direct-entry preference-scope omission:
  direct Hub/Settings now selects the existing Hub scope before mounting, without
  changing authentication state. Final verification is 59 pass / 0 fail / 1
  original platform skip across all 60 navigation cases, 138/138 CI-isolated units,
  all affected type checks and a production build. The evidence record retains
  red probes and the separate ad-hoc shared-process DOM-fixture coupling; no
  broader test-harness work, baseline change or release/manual waiver is included.

## 23. Controlled live candidate handoff

- [ ] 23.1 After sections 18–22 establish capability parity and gates, deliver the live candidate identity, endpoint/action matrix, checks/limits, rollback and separately labeled synthetic review instructions; verify every upstream capability remains reachable and no mock success can be mistaken for a live operation. Obtain version-specific acceptance under 8.3 rather than treating integration authorization as certification.
  - Technical handoff refreshed for deployed `80a2e3d` in `review-evidence/deployment-verification.md`; version-specific human acceptance remains open under 8.3, so this mixed task is not marked complete.
- [x] 23.2 Before any running-service update, have the lead confirm the exact resource scope and preserve the existing live 8445/4717 and synthetic 8446/4718 services until then; verify isolated smoke, auth gating, route/assets and rollback against the approved candidate without resetting state or credentials. No commit/push, spec sync or archive is authorized by these planning revisions.
  - Lead confirmed and renewed the live-only scope; `473514d`, then independently approved `80a2e3d`, were frozen, isolated-smoked, backed up and deployed on 2026-10-16. Current auth/routes/assets/geometry/safety/retention and preservation checks pass. Default hash-verified rollback is preceding473514d; original initial backup remains intact. Rollback was not executed. Synthetic and all Serve routes remain unchanged. See `review-evidence/deployment-verification.md`.

Dependency order: 17.2–17.3 is the bounded first implementation slice (read-only,
no production mount). Section 18 supplies contracts/auth/routing; 19–20 can then
proceed independently where their DTOs are ready. 21.1–21.3 depend on credential
policy in 20; 21.5 depends on 21.4 and credential/onboarding adapters. Section 22
requires all parity paths; 23 follows evidence review and explicitly scoped
deployment. Pending historical visual tasks do not bar authorized implementation,
but remain acceptance obligations. These are implementation stages, not a request
to stage any Git files.

## 24. Approved independent live UX corrections (2026-10-16)

- [x] 24.1 Present workspace More actions first with optional technical details; preserve Rename, branch/worktree, credentials, state-correct Stop/Forget and confirmations.
- [x] 24.2 Open workspace credentials directly and clearly label the global management destination.
- [x] 24.3 Repair workspace/global caller Back and Cancel, nested review drafts and route/task-history consistency.
- [x] 24.4 Group Navigation preferences and repository Credentials tools/assignments; preserve saved deep links, Agent accounts, Notifications, two-destination dock and desktop.
- [x] 24.5 Provide truthful empty credential setup and draft-preserving return across onboarding/clone; expose only applicable add-host/unlock controls without submission.
- [x] 24.6 Consolidate unavailable Chat with agent-specific recovery, installation versus login guidance, full errors and independent retry semantics.
- [x] 24.7 Keep labeled Preview text sizing accessible at 320/390/landscape without dropping controls or targets.
- [x] 24.8 Make clone safety concise with accessible full facts and unchanged relevant confirmations.
- [ ] 24.9 Verify meaningful red/green regressions and production Chromium/WebKit visual flows with populated credentials/multiple worktrees, keyboard/history/retention and desktop scope; inspect actual images and record exact results/limits. Lead review, push/deploy and final human/physical-device acceptance remain separate gates.

### Historical reconciliation checkpoint — 2026-09-10

**31/36 complete; 7.1, 7.4, 8.1, 8.2, 8.3 remain pending.** See
`review-evidence/progress.md` for scoped commands/results and
`review-evidence/scenario-guide.md` for complete screen/scenario coverage and
unaccepted UI exceptions. Reference/measured regression guards do not complete
approved pixel-golden comparison (7.1); current scoped isolation does not recover
exact dirty pre-change all-four-interior proof (7.4). Candidate URLs/documents
are prepared, not remotely verified/delivered (8.1/8.2). Full final browser rerun
after cross-workspace expansion and served fingerprint await lead update.
No human visual/interaction approval or live integration authorization is implied.
