# UX audit follow-up (baseline 32e6d73)

Existing implementation tasks and their verification limitations remain unchanged.
Tests use existing UI/browser and normalization seams; test artifacts stay outside OpenSpec.

## Phase 1 — individual regression commits
- [x] Clear Continue feedback after parent/workers settle (browser regression red: action visible after settlement; green: 1/1).
- [x] Explain queued Send now waking paused steers; retain resume semantics (browser red: ambiguous Send now; green: confirmation cancel/accept and remaining queue; renderer 184/184).
- [x] Order terminal results after launchers without duplicating reports (agent/shell renderer cases red; 186/186 green; typecheck passes).
- [x] Separate vertically adjacent worker Stop targets by at least 0.5rem (Chromium/WebKit touch red: 0px; green: 2/2 including existing target/gap/navigation assertions).
- [x] Diagnose and fix delayed Stop completion race without weakening assertions (red: 9/12 failures; probe: 409 before native dispatch; event-gated browser acknowledgement: 16/16 green). Harness settled before server admission; product correctly rejected an already-settled target. Existing success/result assertions retained and native-call assertion added.

## Phase 2 — pending dock
- [ ] Accessible targets, sticky counts, bounded height/overflow fade, delivery/paused badges and plain timing labels.
- [ ] One paused-steer batch action, contextual accessible names, polite mutation feedback, visible focus, neutral delivery-race feedback and count-only Undo note.

## Phase 3 — composer
- [ ] Checked radio choices and current shortcut labels, accurate Send/selector names, contrast, compact non-steering rail and previous-focus Escape restoration.

## Phase 4 — background surface
- [ ] Consistent rem/token controls, actual-blocker-only Continue with concise explanation, less duplicate touch presentation and explicit stop scopes; use established in-app shell confirmation if appropriate.

## Verification
- [ ] `bun run test:ci` and all three requested browser suites pass.
- [ ] Desktop/touch, light/dark screenshot comparisons reviewed.
- [ ] Affected behavior documentation aligned; independent lead review remains separate.
