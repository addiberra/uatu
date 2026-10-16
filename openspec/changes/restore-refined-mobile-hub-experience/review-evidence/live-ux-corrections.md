# Independent live UX corrections — 2026-10-16

## Scope and identity

Baseline: clean `design/hub-mobile-navigation` at `682fb57`. The user's approved
eight findings are tracked in tasks 24.1–24.9. This is implementation/self-review,
not independent validation or final human acceptance. No push, deployment,
personal/provider login, new dependency or global configuration change is part
of this work. Existing live and synthetic services are preserved.

Implementation commit: `8c7d9f3`, tree
`dec1345897ee109bea342e2eb48359d3efb85701`. The lead reported independent approval
of that exact staged tree, with no findings, 182 tests and eight inspected PNGs.
This is separately reported review provenance, not final human UX acceptance.

## Implementation

- Workspace actions precede optional information; all original technical,
  shell/assignment facts and supported commands remain reachable. Direct
  workspace editing no longer repeats the same button on an intermediate page.
- Workspace versus global assignment callers are explicit. Loading cancellation
  fences late editor reads; Review Back preserves drafts using the existing task
  owner/history. Assignment writes/confirmations remain with existing owners.
- Navigation preferences are grouped; repository tools and assignment management
  belong to Credentials. Existing route identifiers and desktop pages are intact.
- Empty credential catalogs explain optional setup. Nested setup reuses existing
  credential forms, masks/clears secrets, and returns the draft without selecting
  a new credential or submitting. Add-host and clone unlock are contextual.
- Chat has one unavailable summary, agent-labeled retry, full errors even without
  startup diagnostics, and truthful installation versus login guidance. Account
  setup remains a same-document Settings detour, not a CLI installer. These
  presentation changes are touch-only; desktop keeps its existing messages,
  diagnostic visibility and Retry label.
- Preview has a labeled wrapping Text size group and 44px touch targets. Explicit
  touch presentation retains sizing even if pointer media changes on resize.
- Clone uses the existing concise notice/native full disclosure, retaining exact
  sharing facts, per-user dismissal and consequential operation warnings.

## Evidence

Private task-owned artifacts:
`local artifact: mobile UX implementation evidence (untracked)`.
This directory contains logs/screenshots, not live access credentials. Original
independent review images remain untouched in `mobile-ux-independent-sol-20261016`.

Red/green: `bun test src/hub/mobile/flows.test.ts -t 'workspace credentials open
directly|workspace actions precede'` failed 2/2 on the baseline behavior, then
passed after correction. The production 320px Preview test failed on the absent
Text size group before the fix (`red-preview.log`), then passed with labeled
44px keyboard-operable controls. The historical screenshot's disappearing buttons
was not reproduced with a consistently coarse pointer; explicit touch-mode
visibility additionally protects viewport/input-mode changes.

Screenshots are real production documents/API fixtures, not mocked production
responses. The broader continuity fixtures explicitly use deterministic Chat/PTY
doubles through real Hub routes, not external-provider evidence. Missing CLI tests
use a test-owned PATH with the existing Bun and system tools only; no
agent/provider executable can run there.

### Current-source checks

- `bun run typecheck` — passed.
- `bunx tsc --noEmit -p tests/mobile-hub-review/tsconfig.json` — passed.
- `bunx tsc --noEmit -p tests/tsconfig.worktree.json` — passed.
- `bun test src/chat/ui.test.ts src/chat/agents.test.ts src/chat/login-action.test.ts src/chat/shell.test.ts src/hub/mobile src/preview/text-size.test.ts src/preview/layout-toolbar.test.ts src/chat/diagnostics.test.ts src/shared/app-url-discipline.test.ts tests/evidence-discipline.test.ts`
  — **468 passed**, 45 files, 3,961 assertions (`verified-units.log`). The
  Chat UI parent runs its complete isolated child suite, including the final
  touch-only unavailable-state regression.
- `UATU_E2E_BASE_PORT=23400 bunx playwright test tests/e2e/chat-unavailable.e2e.ts --project=e2e --workers=1`
  — **1 passed**: existing desktop startup diagnostics and retry recovery
  (`desktop-chat.log`, `desktop-chat/`).
- `bunx playwright test -c playwright.mobile-live.config.ts mobile-live-ux-review`
  — **16 passed**, Chromium and WebKit (`verified-ux-focus.log`,
  `verified-ux-focus/`). Current touch-only Chat, 320/390/844×390, populated
  credential editing, multiple worktrees, raw Review Back drafts, heading/focus
  restoration, real credential setup cancellation/completion, no clone/workspace
  submission, full safety disclosure, one retry for the chosen missing CLI and
  exact retained workspace identity are checked. Tests create disposable Git
  repositories/tokens only, not personal/provider credentials.
- `bun run build` — passed (`verified-build.log`); existing unsupported
  `highlight` selector warnings remain. Local build only, no service update.
  Rebuilt after committing: `committed-build.log` identifies **8c7d9f3**;
  local `dist/uatu` SHA-256 is
  `a5ba345df3f5817655a15ed9afa6d9d8aae271d0950612ffb0ed114d778ad81f`.
- `bun test src/preview src/shell/tab-bar.test.ts src/shell/navigation-preferences.test.ts`
  — **168 passed**, 16 files (`verified-preview-navigation.log`). This overlaps
  some focused tests above; counts are not added into a fabricated unique total.
- The existing `auditBundle()` check from
  `tests/mobile-hub-review/isolation-audit.ts` was called directly for
  `src/index.html`, `src/hub/mobile/live-entry.ts` and
  `src/hub/mobile/frontend.ts` — passed, **zero forbidden runtime modules or
  output markers**, with 1,107 / 63 / 27 runtime modules respectively
  (`verified-bundle-isolation.log`). This bounded runtime-graph check does not
  claim the separate historical archive-digest gate passes.
- `git diff --check` and `openspec validate restore-refined-mobile-hub-experience --strict`
  — passed.

### Broader matrix: unresolved, not green

All matrix invocations use `bunx playwright test -c playwright.mobile-live.config.ts`
with these files: `mobile-live-ux-review mobile-live-geometry mobile-live-inventory
mobile-live-continuity mobile-live-operations mobile-live-credentials
mobile-live-accounts mobile-live-notifications`.

1. The first broader run (`final-browser.log`) used changing source and finished
   **103 passed / 1 failed**. Its failure was fixture setup, before the external-Stop
   body: `hub e2e server did not reset within 20s`. It is not a current green claim.
2. The frozen-production-source rerun used
   `UATU_E2E_HUB_BASE_PORT=23200 UATU_E2E_BASE_PORT=23300`, output
   `verified-browser/`. Native completion reported exit **1**, **102 passed /
   2 failed** in 17.8 minutes. Chromium failed at the Remove confirmation click
   in coordinated assignment removal (30s test timeout), and retained dark-mode
   entry remained at “Waiting for viewable files” instead of README (10s assertion
   timeout), followed by incomplete fixture Hub shutdown. WebKit passed these
   cases. The previous external-Stop setup failure did not recur.
3. With unchanged source/tests/budgets, the exact two failed Chromium cases were
   run using `--grep 'coordinated assignment removal|dark.*production overview'
   --repeat-each=2 --trace=on` against `mobile-live-continuity mobile-live-geometry`.
   **4 passed** (`failure-reproduction.log`, `failure-reproduction/`). This does
   not establish a cause or waive the full-run failures.
4. A final full run on the same port range added `--trace=retain-on-failure`, output
   `final-frozen-browser/`. The foreground shell command exceeded its **1,200,000ms**
   limit before suite completion. Its log records **78 passes and 8 failures**;
   there is no completed 104-test summary. Later WebKit failures include HTTP-500
   session starts reporting disposable Git repositories as non-Git, page-fixture
   setup timeouts and desktop navigation timeout. Preserve these traces/error
   contexts for diagnosis; do not infer they are harmless resource flakes.

Product/source fingerprints stayed unchanged throughout the frozen runs. The
test-only focus/no-auto-submit enhancements were separately verified by the
16-test run above; the final full run included them. No assertion, timeout,
baseline or product behavior was changed to obtain a pass. The full-run failures
are not yet reproducible in the isolated four-case check, and their root cause
remains unconfirmed. Other users' processes/services were not stopped to improve
test conditions. Reliable broader verification and diagnosis are a lead handoff
blocker, not a completed acceptance gate.

Tasks **24.1–24.8 are verified; 24.9 remains unchecked**. No further product edit
was made after independent approval. Existing historical/manual gates stay open.

### Actual image inspection

Inspected the rendered PNGs in `verified-ux-focus/`, not only accessibility trees:
Chromium `preview-320.png` (labeled wrapping sizing, retained prior controls and
visible focus); WebKit `workspace-actions-390.png` (all action-first commands
above subordinate facts), `credential-editor-320.png` (readable task header and
workspace context; the raw host draft below the fold is asserted by the test),
`multi-checkout-inventory.png` (both real checkouts and creation/refresh
actions), and `chat-unavailable.png` (one summary, separate named agents and
recovery). Also inspected Chromium `settings-390.png` (populated Credentials with
tools and clearly named workspace management), `clone-safety-320.png` (full safety
text reflow), and WebKit `clone-844.png` (concise notice in short landscape).
Each name is unique within its browser's feature-named Playwright output folder;
the screenshots and report attachments are retained privately for lead review.
These are self-reviewed compositions, not approved pixel goldens or human UX
acceptance. Navigation grouping also has explicit structural/browser assertions;
the overview screenshot does not claim to show every scrolled Settings group.

### Self-review and publication safety

Reviewed the full baseline-to-candidate diff, including untracked tests and
planning/evidence additions. No API/authentication/configuration change, new
dependency, provider login or fixture import in product code was introduced.
Existing validation, masked/cleared secrets, backend authority, confirmations and
coordinated-stop ordering remain owned by their original modules. Setup returns
the authoritative newly created public DTO to the unchanged draft, without a
second catalog-read failure path, auto-selection or auto-submit.

Tests update only assertions superseded by the approved behavior: grouped Settings,
action-first workspace disclosure, direct editor versus assignment management,
and clone safety disclosure. Full safety facts and existing operation checks stay;
no golden/baseline was updated. Screenshots remain private/untracked because
production fixtures include machine hostname and disposable runtime paths. Added
test credentials are explicit disposable `.test` examples, not personal secrets.
Use the repository's existing identity for local commits; no identity/config write
is required. This self-review is not independent lead validation.

## Gates retained

Physical iPhone/iPad, native Desktop execution, final human visual/interaction
acceptance and historical approved-golden/archive/broader Chat obligations remain
open. Emulated browser keyboard/geometry checks are not physical-device evidence.
The lead must independently review this named candidate before push/deploy.
