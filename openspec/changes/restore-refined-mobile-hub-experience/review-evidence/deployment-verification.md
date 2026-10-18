# Isolated live deployment verification

## Fresh persistent recreation — 2026-10-18

The user approved a **fresh disposable deployment**, acknowledging that the old
temporary runtime and edits were unavailable. This recreation does not recover
or preserve that old state. Earlier deployment sections below are historical.

| Field | Verified value |
| --- | --- |
| Frozen source | Clean `44eb5e5d101d84603487044c0943ec712cda7735`, before this documentation edit |
| Embedded version | `v0.8.0-mobile-ux.44eb5e5 · 44eb5e5` |
| Binary SHA-256 | `f5c532f9d7e3e6a71b30c00823e45bc433cc188e68193cb7a5e4435aa0181b78` |
| Runtime | Private durable user-data directory; isolated binary, HOME, config, state and logs |
| Fixtures | New `atlas-docs`, `beacon-app`, `cedar-notes` local Git repositories; document/image/code examples, `main` and `review/alternate`; no remotes |
| Access | Existing live tailnet HTTPS route and user-selected login reused; loopback listener only |

Compiled-binary smoke passed **before launch**, including child assets, document
and live-stream delivery, worktree registration, desktop menus and mobile
Settings/Return. Existing CSS `highlight` warnings did not fail the build.

Live checks passed in **three browser contexts**:

- Actual tailnet HTTPS: Chromium at320px and WebKit at390px. Both covered
  anonymous401, login, source/version API, action-first workspace information
  and More, direct credential editing with Cancel/browser Back, Settings groups,
  Clone's compact notice and expanded safety facts, loaded README image,
  preview text scaling, unavailable Chat agents with setup navigation, and Return
  retaining the exact workspace root node.
- Loopback: Chromium desktop1280 covered anonymous401, login, source/version,
  README preview and decoded image.
- All contexts had zero page errors; each logged out only its own session and
  verified protected401 afterward. A separate loopback inspection login also
  signed out. Fixtures were registered/started through the supported API with
  browser cookies and same-origin CSRF handling. No clone or provider login was
  submitted and no credentials or terminal sessions were created.

A scoped per-user LaunchAgent supervises the Hub and starts at GUI login, not
before login at system boot. State and fixtures are outside temporary storage.
Reboot and automatic workspace-session resumption were not tested. The existing
live Serve route was reused without route changes; the old synthetic service
was **not recreated** and its existing route was left alone. No Funnel or global
service changes were made. No tools/dependencies were installed.

Private operational handoff, checksums, browser scripts/logs and captures are
retained with the durable runtime, outside Git. Config/state/log files are
owner-only; the handoff contains scoped status/start/stop commands and unchanged
login details. There is **no previous-runtime rollback** for this fresh setup.
Isolated HOME/config and an empty inherited SSH-agent socket are hygiene, not an
OS sandbox: terminal/project processes retain the user's OS privileges.

These are self-verification results, not independent validation, full-suite
re-execution, physical-device testing or human acceptance. The previously
reported104/104 source browser run was not rerun as part of this deployment.

## Historical isolated live candidate 80a2e3d — 2026-10-16

### Historical deployment: reviewed geometry and compact safety correction

**Ready for live testing; final human/native acceptance remains open.** The lead
renewed task 23.2's exact live-only authorization for independently approved
`80a2e3d2c76467264589589a7726beaf857c3a03`. No additional UI edits were made.
The previous `473514d` deployment below is history, not the current fingerprint.

| Current field | Verified value |
| --- | --- |
| Frozen source | Exact Git archive of `80a2e3d2c76467264589589a7726beaf857c3a03`; uncommitted deployment docs excluded |
| Embedded version | `v0.8.0-mobile-live.80a2e3d · 80a2e3d` |
| Binary SHA-256 | `6e03bc128c45b14a0fcf57f0fdbad72e49f6f6fcbf289831262426f68ee44a57` |
| Default rollback | Preceding `473514d`, SHA-256 `fbad0535c477c09280a76204a6fbf716b9f4fb86080510ac414fb7131161d8f5` |
| Access / synthetic | Existing private live URL/login unchanged; separate **OLD synthetic** untouched |
| Public API / task status | Hub14/workspace24 unchanged; **95/100**, same five human/historical gates open |

### Current checks and controlled effects

- Verified preceding binary against its retained checksum; saved restricted
  preceding binary/checksum/config/auth/plists/data/state, including a consistent
  stopped-state snapshot. Original initial-artifact backup remains intact.
- Built the frozen source with existing dependencies using
  `--version 0.8.0-mobile-live.80a2e3d`. Compiled-binary smoke passed under isolated
  HOME/TMPDIR on a new unused ephemeral port **before** production restart. It
  covered child assets, real document/live delivery, disposable Git worktrees,
  desktop menu and phone Settings/Return. Existing CSS `highlight` warnings only.
- Graceful stop → confirmed old PID/listener exit → atomic binary replacement →
  bootstrap of the unchanged live plist. Only the assigned live job restarted.
  Existing workspace/terminal processes ended as authorized; all three retained
  fixtures were resumed **only when stopped**. No state/auth/repository reset.
- Deployed browser check **9/9 passed**: Chromium390 light/dark,320,landscape,
  touch tablet,desktop; WebKit390 light and320 light/dark. Both engines exercised
  same-machine tailnet HTTPS; remaining cases used loopback. Assertions covered
  anonymous401, existing login, current source/version, authoritative fixture
  names/paths/running state, canonical Open, loaded images, two dock destinations,
  loaded Agent accounts/scope, Notifications, Cancel and exact document/root
  retention through Hub/Settings/Return. Own-session logout returned protected401.
- Every observed served JS asset passed the ten synthetic/privileged-marker
  checks; unique asset paths and SHA-256s are retained. No fixture renderer/mock
  success is used for live operations. No external-provider login or push consent.
- Entire Serve configuration and OLD synthetic health/PID/startup identity/hash
  matched before/after. Config/auth/both plists and repository **file hashes plus
  Git statuses** matched. No Funnel, other-service change or user-session revoke.
- Prepared hash-verified live-only rollback to `473514d`, syntax checked, **not
  executed**. It restores no state/config/repos/routes. Original initial binary
  remains an explicitly separate historical rollback, not the default.

Private operational details and evidence are linked by the
[current ignored pointer](../../../../.local/live-deployment-80a2e3d.md).
The first deployed-browser harness sampled a retained view before its card DOM
settled; adding the actual heading/card readiness precondition fixed the harness.
Its diagnostic log/capture remains; no product assertion or UI was weakened.

### Current visual comparison and resolved earlier findings

Actual deployed PNGs and canonical/previous/current contact sheets were opened
with the image reader. Refined references are normalized from DPR2 to390×844;
actual captures use DPR1, including320×740 WebKit and1440×1000 fine-pointer desktop.

| Check | Current observed / asserted outcome |
| --- | --- |
| 390px direct and retained Hub/Settings | Heading line box `(20,65)`; cards x20/width350; main padding0. The prior x36/318px column and vertical shift are **resolved**, not accepted deviations. |
| 320px WebKit light/dark | Margin12/cardwidth296, heading y65; Running remains one whole line and branch is a separate semantic item. The prior split Running/main defect is **resolved**. |
| Overview safety | Concise notice and closed native “Credential safety details” disclosure. The previous always-expanded oversized explanation is **resolved**. |
| Full safety / dismissal | Keyboard expansion retains all assignment-defaults/non-isolation, same-UID/runtime-file/shared-agent/configuration/other-assignment, untrusted-project and token/shell-stop facts. Details remain reachable after notice dismissal and reload. Final facts were scrolled into view and captured. |
| Reference/data substitutions | Current branding and genuine long fixture paths, three running workspaces, empty credential catalog and unavailable agents are truthful live data, not fabricated reference keys/accounts. These affect card/list density and still require user review. |
| Desktop | Legacy680px main at x380, padding40/20/64 and simulated+72px native-titlebar inset retained on Hub/Settings/clone. Old/new dashboard composition remains desktop, not phone grouping. No historical pixel/native certification is inferred. |

See [the approved source geometry record](geometry-correction.md) for the red–green
cascade diagnosis, scoped fixes, final **88/88 production cases**, **467 units**,
typechecks, four standalone cases and current Preview-interior isolation checks.
Those source checks are reused with their exact provenance, not claimed as rerun
by deployment. The final manifest's five source hashes and 146 screenshot hashes
were verified again.
The older 22-PNG responsive archive remains historical: its earlier style hash
does **not** match this correction and is not presented as a fresh80a2e3d pass.

Task9.6's current comparison packet is refreshed; task23.2 is verified again.
Task23.1's technical handoff now names80a2e3d, but it remains unchecked for final
version-specific acceptance under8.3. The five open tasks remain7.1/7.4/8.3/22.3/23.1:
approved pixel goldens, exact missing historical comparisons and final
visual/interaction/native/physical checks have not been manufactured or waived.
The archive-digest mismatch remains open. No push, spec sync or archive.

Owned exported source/archive and isolated smoke HOME/TMPDIR were removed after
successful verification. Current binary/rollback/logs/scripts/captures/manifests
remain in the private task-unique deployment directory for handoff/debugging;
previous deployment evidence and shared scratch were preserved.

Current documentation checks passed: `git diff --check`, strict OpenSpec
validation, rollback syntax and private-password/hostname/absolute-path scanning.
Evidence-discipline/privacy/hosting tests: **5 passed / 0 failed / 99 assertions**.
Final documentation publication is authorized by the lead using the existing
approved identity; independent documentation review remains the lead's next step.

## Historical deployment: 473514d (superseded by current section)

Follow-up: [source-only geometry and contextual safety correction](geometry-correction.md)
addresses the unapproved defects found in the images below. It does not update
this deployed `473514d` executable or retroactively approve its fidelity.

**Deployed for user testing, not final visual acceptance or release approval.**
The lead explicitly confirmed task 23.2's exact live-job resource scope. Only
the isolated parallel live Hub was updated; the existing synthetic reviewer,
all other services and every Tailscale Serve route were preserved. No Funnel,
auth/config reset, provider login, push, spec sync or archive was performed.

## Named artifact and access

| Field | Verified value |
| --- | --- |
| Candidate source | Clean `473514d912c70d373987e2f918f7391b7e32e774` at build time |
| Embedded version | `v0.8.0-mobile-live.473514d · 473514d` |
| Frozen executable SHA-256 | `fbad0535c477c09280a76204a6fbf716b9f4fb86080510ac414fb7131161d8f5` |
| Prior executable SHA-256 | `25c79a6d16d13cee785448dbaffbe575f8b1cdc7fb81f037e589bb4841e5380d` |
| Public API revisions | Hub 14 / workspace 24, unchanged |
| Live access | Existing private live URL and reviewer login, unchanged |
| Synthetic access | Existing separate URL, **OLD synthetic**, not refreshed |

Private hostname, password, PIDs/start time, complete captures, configuration,
state snapshots and exact start/stop/rollback instructions remain outside tracked
content. Local evidence entry: [ignored operational pointer](../../../../.local/live-deployment-473514d.md).
The private `HANDOFF.md` is authoritative for access and lifecycle; historical
combined-service commands are explicitly superseded by its live-only section.

## Deployment and current primary evidence

- Verified the old executable against its retained checksum before replacement.
  Saved a restricted previous binary/checksum, minimum private config/data/state
  and a consistent stopped-state copy. Repository fixture files were not reset.
- `bun run scripts/build.ts --version 0.8.0-mobile-live.473514d --outfile <private-candidate>`
  passed from clean source; only existing unsupported CSS `highlight` warnings.
- `UATU_SMOKE_BINARY=<private-candidate> bun run scripts/smoke-binary.ts` passed
  under isolated HOME/TMPDIR with the existing browser cache explicitly selected,
  on an ephemeral unused loopback port. It exercised compiled Hub/child assets,
  real Git worktree creation in disposable smoke state, document/live delivery,
  desktop worktree menu and phone Settings/Return. No Git mutation was needed
  in the running reviewer fixtures. The first attempt lacked the browser cache
  under the isolated HOME; no installation was made.
- Gracefully removed and bootstrapped only the authorized live launchd job with
  its unchanged plist, atomically replacing its executable. No route changes.
  Restart ended its previous workspace/terminal processes as already disclosed.
  All three registered fixture workspaces were explicitly restored to running;
  Atlas used the real phone Start/no-credentials confirmation, the other two the
  existing authenticated Start API. Fixture Git statuses are unchanged.
- Private `verify-live.ts` final run: **8/8 scenarios passed**. Chromium: 390×844
  light/dark, 320×740, 844×390 landscape, 820×1180 touch tablet, 1440×1000 desktop.
  WebKit: 390×844 and 320×740 dark. Both engines used same-machine tailnet HTTPS;
  other cases used loopback. Each checked anonymous 401, existing login,
  authenticated source/version, live UI/preview, and own-session logout → 401.
  Phone cases checked canonical Open, exactly two persistent dock destinations,
  compact single-checkout cards, Notifications, separate Agent accounts and
  shared-scope warning, contextual credential warning, Cancel/Return and exact
  retained document/root identity. No external-provider login or push enrollment.
- Desktop dashboard/Settings/clone honored a simulated **72px titlebar inset**;
  fine-pointer entry had no mobile root. `bun tests/mobile-hub-review/compatibility.ts`
  separately passed **4/4** Chromium/WebKit desktop/touch standalone cases.
  This is browser simulation, not native WebView/Xcode validation.
- Private `check-assets.ts`: all visible images loaded on dashboard, Settings and
  workspace. **Three actually served JS assets** had zero matches for the ten
  existing synthetic/privileged audit markers; per-asset SHA-256 is retained.
  The real fixture README's word “synthetic” describes disposable repository
  content, not the backend. Authenticated Hub operations are real, not mock success.
- Entire Serve JSON, synthetic health/PID/startup identity/frontend fingerprint,
  access file, live config and launch plist matched before/after. No other user's
  session was revoked. Only newly created smoke logins were signed out.
- Rollback helper syntax is checked; rollback itself is **prepared, not executed**.
  It checks both artifact hashes and restores only the preceding live executable,
  leaving state/config/repos/routes/synthetic intact. Restoring old state is not
  routine rollback and requires a diagnosed need and scoped lead confirmation.

Early deployed-browser harness attempts had an ambiguous Start selector, an
invented Credentials destination selector, and an expansion-state assumption;
the private harness was corrected to actual alertdialog/group/handle semantics.
Asset capture initially tried reading redirect/obsolete browser response bodies;
the final check fetches the observed served asset paths through its own session.
These attempts are retained, not product failures or silently inherited passes.

## Before/after visual comparison

Images were opened with the image reader, not assessed only through DOM checks.
Private contact sheets pair canonical refined references (DPR 2 normalized to
390×844 CSS px), retained prior live phone captures (390×844, DPR 1), and new live
captures (390×844, DPR 1). No reference, golden, baseline or assertion was updated.

| Comparison | Observed difference / limit |
| --- | --- |
| Refined `01-hub.png` → live dashboard | Icon-led Running groups, compact cards, branch/status/Open hierarchy, plus Add and two icon/label tabs replace the old repository header/main-row duplication and three text tabs. Current logo/name, real host/count, all-running fixture state and long paths are explicit substitutions. |
| Refined `15-return-in-settings.png` → live Settings | Identity/status and grouped destinations replace inline desktop management. The later agreed Credentials safety detail, separate Agent accounts and Notifications groups extend the original reference; Return exists only after a real visit. No synthetic key/account is fabricated for the clean runtime. |
| Geometry / long-path real fixtures | At 390px, live heading/cards begin around x=36 rather than the normalized reference's x=20; the content column is narrower. Long paths make cards taller, and at 320px WebKit the Running/main metadata wraps awkwardly. Settings' full safety explanation pushes later groups below the first viewport. These are review-visible differences for the lead/user, **not approved fidelity exceptions**. |
| Light/dark, small phone, landscape, tablet | New live captures retain readable themes and icon hierarchy. Short landscape intentionally scrolls under the dock; an initial screenshot alone does not prove every covered row is reachable. Earlier responsive behavioral checks supply that separate evidence. |
| Enlarged text / keyboard / reduced preferences | Reused 22 retained PNGs from `.local/mobile-responsive-reconciled/`; all were image-inspected in two contact sheets, with the keyboard example also opened full-size. Their recorded style/test/server source hashes match the deployed, pre-correction `473514d` source, not the current corrected files. They show reflow, masked focused input and distinct forced-color/contrast/reduced variants. They are synthetic, scoped-font stress and reduced viewport evidence, **not OS Dynamic Type, real keyboard or physical safe-area tests**. WebKit reduced-transparency emulation remains unsupported. |
| Desktop prior live → candidate | The retained loaded desktop capture keeps the same 640px Active/repository/main-row composition and Rename/fork/Open/Stop hierarchy. Version and post-restart shell facts differ. No phone grouping or dock leaked into fine-pointer presentation. |
| Desktop workspace immediately before → after | Same real Atlas content, fonts, sidebar, preview toolbar and main layout. The after capture additionally shows “Changes vs main”, shifting the file tree; version differs. Git/readiness timing was not normalized, so these images alone do not establish a code/style cause or pixel identity. This is a named comparison limit, not an approved phone-interior exception. |

The newly taken **before** dashboard/settings screenshots caught loading and the
previously documented phone `fullPage` chrome discrepancy. They are retained but
are **not settled visual baselines**. Use the older loaded `comparison/phone-tailnet-*`
and `comparison/desktop-live-*` captures, with their existing `READ-FIRST.txt`
provenance: the old binary is a frozen then-dirty merge artifact, not a clean
historical source reconstruction. Its checksum identifies the actual old bytes.
The separately retained `37047e5` browser-intercepted baseline uses copied GET
fixtures, not an old running backend. Neither establishes missing historical
native/dirty-tree four-surface evidence.

## Reused matrices, remaining gates and handoff

The [source verification record](live-entry-verification.md) remains the evidence
for 74 live / 342 synthetic browser cases, 503 focused units, the later inventory
resume checks, two 37-case Chat passes, and the final navigation 59-pass/one
platform-skip and 138-unit checks. These were reported independently reviewed by
the lead; this deployment work does not claim another independent review or rerun
them all. The retained responsive report is **1,102 PASS / one UNSUPPORTED**;
its three recorded source hashes match deployed, pre-correction `473514d`, not
the current corrected files. The older 11 Chat failures
are now historical corrected failures, not current reds or waived assertions.
The unexplained original archive-digest mismatch remains open and unchanged.

Tasks 9.6 (machine matrices and reconciled before/after UX evidence with named
limits) and 23.2 (verified scoped deployment) are complete. Task 23.1's candidate identity, capability/action matrix
([integration map](integration-map.md)), evidence, rollback and separate synthetic
instructions are delivered; its version-specific human acceptance remains open
under 8.3. The machine checks/comparison portion of 22.3 is delivered, but the
exact historical four-interior/native comparisons cannot be certified from the
available evidence. Task 22.3 remains unchecked rather than fabricating missing
before images. Task 7.1 still lacks approved pixel goldens, 7.4 the exact
historical baseline, and 8.3 the user's named-version visual/interaction decision.
Physical/native device checks, final visual exceptions and release acceptance
remain for the user/lead. The user can test the live candidate now.

Documentation checks: `git diff --check`, strict OpenSpec validation, rollback
Python syntax, and publication scanning for the private password, hostname and
absolute paths passed. Evidence-discipline, reviewer privacy and hosting tests:
**5 passed / 0 failed / 99 assertions**. No commit or push was made in this
deployment session; final sanitized documentation remains for lead review.
