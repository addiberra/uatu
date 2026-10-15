## Purpose

Provide isolated synthetic review of the shipping mobile frontend, with reference-fidelity evidence and separate records for integration authorization, live correctness and final visual/device acceptance.

## ADDED Requirements

### Requirement: Review uses the intended shipping frontend
The review environment SHALL render the same reusable frontend intended for live integration, including the current Files, Preview, Chat, and Terminal clients. Synthetic behavior SHALL replace backend responses, not frontend screens, event owners, or state transitions. Fictional content, operation doubles, and scenario controls MUST NOT be included in production modules or production bundles. Screenshots, an iframe, a second fake terminal, or a parallel mock-only Hub UI MUST NOT substitute for the frontend being approved.

#### Scenario: Frontend survives backend replacement
- **WHEN** the review frontend performs a workspace, Settings, or navigation interaction
- **THEN** the frontend's own event and state owners handle it using the supplied backend interface
- **AND** later live integration does not require replacing the approved views with another implementation

#### Scenario: Real surface clients receive synthetic work
- **WHEN** a reviewer opens Chat or Terminal and a synthetic stream produces output
- **THEN** the existing client renders that output and maintains its own scroll, draft, and attention behavior
- **AND** no provider inference or executable shell is started

### Requirement: Mock operations cannot reach live resources
The review environment SHALL be separately launched, visibly identified as simulated, and isolated from existing Hub configuration, sessions, workspaces, credentials, and server processes. Backend operations SHALL act only on synthetic test-owned state. Unexpected requests or transports SHALL fail closed with a diagnosable error, never fall through to a live backend. Scenario reset SHALL clear only review state. Review actions MUST NOT read personal secrets, run credential tools, probe real repositories, clone, mutate workspace files, or create real PTYs.

#### Scenario: Synthetic destructive action
- **WHEN** a reviewer confirms Stop, Forget, credential deletion, device revoke, or folder removal
- **THEN** only the selected synthetic scenario changes
- **AND** existing live Hub sessions and the real filesystem remain unchanged

#### Scenario: Unimplemented request
- **WHEN** a frontend request has no mock handler
- **THEN** the harness reports the missing contract and rejects the request
- **AND** it does not proxy to a real Hub or silently report success

### Requirement: Review covers complete flows and deterministic exceptional states
The review SHALL provide the screen/state inventory in the change's `screen-map.md`, distinguishing directly pictured states from design extensions. Scenario selection SHALL support representative identities, running/stopped/empty states, branch variants, credential capabilities, pending operations, failures, recovery, and synthetic stream progression. Review-only controls SHALL remain separate from product Settings and SHALL not distort the product viewport used for visual comparisons. All sensitive-input examples SHALL use disposable test data with masking and clearing behavior; the review SHALL warn against entering real credentials.

#### Scenario: Reviewer inspects an unpictured flow
- **WHEN** the reviewer chooses a credential type or onboarding outcome not pictured in the reference
- **THEN** the actual frontend presents a coherent extension of the reference's grouped detail and subsequently agreed full-page task patterns
- **AND** the handoff identifies it as requiring review rather than previously approved design

#### Scenario: Review a delayed failure
- **WHEN** a configured operation remains pending and then fails
- **THEN** its control, contextual error, retry/cancel behavior, and retained non-secret form state are observable
- **AND** the simulation does not bypass the actual frontend submission path

### Requirement: Visual evidence is compared rather than merely captured
The review SHALL compare named frontend states with the corresponding refined reference images, normalizing CSS viewport, image scale, theme, and font readiness. Approved branding differences, dynamic fixture content, unchanged workspace interiors, and accessibility adaptations SHALL be identified explicitly. Visual evidence SHALL include composition, typography, icons, spacing, materials, and task transitions, not only overflow or element existence. Deterministic frontend captures SHALL have regression comparisons; expected images MUST NOT be updated simply to make a mismatch pass.

#### Scenario: Structurally wrong but functional navigation
- **WHEN** Hub and Settings links work but lack the reference's icons and label hierarchy
- **THEN** reference-fidelity acceptance fails even if functional tests pass

#### Scenario: Fixture text differs
- **WHEN** a deterministic review workspace has a different name or path from the archived screenshot
- **THEN** the comparison records the text substitution without treating it as permission to change row composition or hide layout differences

### Requirement: Explicit authorization and final acceptance remain distinct
The frontend-first review SHALL provide a reachable review URL, scenario instructions, evidence and known gaps. Live implementation SHALL require explicit user authorization, not inference from tests or task completion. The record SHALL distinguish agreed design direction and integration authorization from final version-specific visual/interaction acceptance, live correctness, physical-device checks and deployment scope. The 2026-10-15 agreement authorizes integration of the refined phone target and its named hierarchy amendments; it MUST NOT be reported as completed visual/physical-device certification or acceptance of unresolved failures. Spec sync and archive SHALL remain outside this planning amendment.

#### Scenario: Tests pass without integration authorization
- **WHEN** frontend checks pass but the user has not authorized live integration
- **THEN** backend implementation does not begin automatically and the record still requests the missing authorization

#### Scenario: Integration explicitly authorized with acceptance still open
- **WHEN** the user agrees the refined UI as the live phone target and explicitly authorizes its integration
- **THEN** the authorized task set can proceed without falsely completing final visual/interaction or physical-device acceptance
- **AND** known failures, missing goldens and other evidence limits remain named and unwaived

#### Scenario: Reviewer requests changes
- **WHEN** the user rejects a visual state or interaction
- **THEN** the frontend is corrected and re-presented against the same reference contract
- **AND** the rejected result is not accepted as a new baseline merely because it was implemented

### Requirement: Live and synthetic evidence keep distinct provenance
The synthetic reviewer SHALL remain fail-closed and isolated after live integration is authorized. Reports SHALL identify frontend version, backend mode, fixture/real operation scope, browser versus physical device, and actual results. Live capability parity SHALL include upstream worktrees, repository credentials, Agent accounts and Notifications without pretending synthetic provider results are personal account tests. Neither service SHALL be restarted, reset or repurposed by planning edits.

#### Scenario: Parallel reviewers remain distinguishable
- **WHEN** the same refined UI is reviewed against synthetic services and an isolated real Hub
- **THEN** their separate endpoints and evidence identify which operations are simulated versus backed by the live server
- **AND** synthetic reset never changes live sessions, files or credentials
