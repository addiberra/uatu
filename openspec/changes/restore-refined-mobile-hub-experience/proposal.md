## Why

The implemented touch Hub does not reproduce the approved refined reference: desktop-oriented panels and inline forms replaced its mobile hierarchy, grouped Settings, icon navigation, and task sheets. Functional checks passed without enforcing visual fidelity, and full-page navigation prevents the workspace continuity the user now explicitly requires.

## What Changes

- Preserve the **frontend-first history** and amend this existing change to integrate its reusable refined mobile frontend into the **live phone Hub**. On 2026-10-15 the user agreed this design direction and explicitly authorized live integration, superseding the integration stop formerly bundled into task 8.3. This is not final visual acceptance, physical-device certification, or permission to sync/archive.
- Treat `design/hub-mobile/refined.html` and its retained screenshots as a screen/state-level visual contract, not loose inspiration. Retain the current UatuCode name/logo as an explicit exception; keep system accessibility adaptations. Desktop Hub presentation and workspace interiors are not redesigned.
- Implement reference-faithful touch dashboard composition, grouped Settings and focused full-page editors (the later approved refinement), icon-and-label navigation, Return hierarchy, and coordinated overlay materials. Use compact cards for one checkout; disclose branch/checkout rows only for multiple checkouts. Keep Rename and branch/worktree creation secondary in More actions. Preserve all upstream operations and present unpictured states for review.
- Keep exactly two persistent dock destinations, Hub and Settings, plus contextual Return after a workspace visit. Put Notifications in Settings and Agent accounts in a separate Settings group from repository Credentials, with focused agent/provider pages. Place the credential-sharing notice contextually in Credentials and retain full safety details in relevant credential, assignment, clone and account flows; do not weaken safeguards or redesign desktop.
- Preserve one active workspace's browser-side state and ongoing client work across ordinary Hub/Settings/Return navigation through a **same-document integration with no iframes**. This supersedes the archived change's restoration-only constraint, not authentication or server-session lifetime rules.
- Connect real authenticated Hub reads, mutations and streams to the existing mobile interface, extending it for upstream worktrees, Agent accounts and Notifications. Reuse authoritative services and publish only required additive contracts, including truthful branch facts and clone-attempt reconciliation; never infer live facts from fixtures or readiness prose.
- Add a deterministic review harness, visual comparisons, continuity tests, and an explicit human acceptance record. Keep mocks, fictional identities, scenario controls, and simulated operations in `tests/`, never in product code.

## Capabilities

### New Capabilities

- `mobile-hub-continuity`: Same-document, frame-free workspace retention across touch Hub and Settings visits, including route ownership, focus isolation, async work, and invalidation.
- `mobile-hub-review`: Isolated mocked-backend review of the shipping frontend, deterministic scenarios, provenance, and distinct records for design/integration authorization and final acceptance.

### Modified Capabilities

- `hub-dashboard`: Replace approximate touch presentation with a reference-fidelity contract and coherent overview/detail/task composition while retaining complete operations, current branding, and desktop behavior.
- `touch-navigation`: Replace the full-page Hub-detour requirement with same-document mobile workspace retention while preserving server-owned lifetimes and the existing desktop, standalone, and cross-workspace boundaries.

## Impact

- Work is expected under `src/hub/mobile/`, Hub server/asset assembly and existing `src/shell/` and workspace entry owners. The existing workspace surfaces, `appState`, document identity, credential/worktree/agent-account services, notification enrollment, and terminal/chat behavior remain owned by their current modules. API additions require aligned OpenAPI, operation/stream inventories, revision compatibility checks and documentation.
- Test-only launchers, backend doubles, and fixtures live under `tests/`; colocated unit tests and feature E2E tests remain at the existing seams. Review serves a distinct loopback port and Tailscale endpoint without replacing the existing Hub or the archived reference endpoint.
- The original frontend-first stage prohibited live effects. The authorized integration stage now covers their implementation and isolated acceptance tests, not unrestricted use of personal credentials, host configuration, paid providers or existing live services. No new dependencies or native Desktop redesign are assumed. Ask before any material expansion or deployment/resource change beyond assigned scope.
- Live acceptance must cover routing/authentication/CSRF, provider and repository credentials, clone/start/stop/worktrees, retention and desktop nonregression. A mock pass is not live correctness. Existing broader Chat touch failures and archive-digest mismatch remain unwaived; outstanding visual, full-matrix and physical-device checks remain open.
- Supporting artifacts: `diagnosis.md`, `reference-contract.md`, and `screen-map.md`. The archived change and original reference remain historical evidence and are not rewritten.
