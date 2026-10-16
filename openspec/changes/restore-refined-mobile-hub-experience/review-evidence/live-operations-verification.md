# Live operations checkpoint — 2026-10-15

Historical adapter checkpoint. Later production assembly and the final-review
inventory/branding corrections are recorded in `live-entry-verification.md`;
the unmounted/dependency status below applies to this earlier checkpoint only.

Self-verification, not independent review or version-specific visual acceptance.
Continues the preserved unfinished work after `9b1cdc4`. Existing live and
synthetic services, operator configuration and personal credentials are untouched.

## Implemented boundary

- Browser-only live backend assembly now connects auth/devices, credential and
  tool reads/writes, inherited workspace policy, lifecycle, onboarding/folders,
  clone admission/reconciliation, event replay, input and cancellation. It is not
  mounted into production yet; upstream Agent accounts, Notifications and
  worktree presentation remain dependencies, not omitted capabilities.
- Private key size/source checks precede file reads. Provider-token stop consent
  names projected users without inventing them from current assignments.
  Unavailable catalog/parent policy cannot become an empty assignment list.
- Clone admission persists a pending tombstone before dispatch, serializes
  concurrent attempts, returns the original accepted job, and durably fences
  nonacceptance. Job expiry/restart and acceptance persistence failure stay
  uncertain/expired. No URL, prompt or raw request is persisted by this store.
  The canonical leased state-root owner assembles it; test handlers never resolve
  a personal default directory. Capacity is 10,000 non-evicted records, then new
  admission fails closed. No automatic tombstone deletion is safe.
- Revision 14 / workspace 24 publishes clone attempt routes/retention and the
  optional onboarding error code. Legacy clone requests remain supported. The
  onboarding response is closed, so its new optional field requires the Hub bump.
- Clone stream frames preserve partial target/workspace/running/reason facts,
  fence auth invalidation and never turn disconnect into cancellation or retry.
  Repository credential operations cannot act as agent-account login operations.

## Executed checks

- Both `bun run typecheck` and
  `bun node_modules/typescript/bin/tsc --noEmit -p tests/mobile-hub-review/tsconfig.json`
  passed.
- `bun test src/hub/mobile src/hub/clone-attempts.test.ts src/hub/live-sse.test.ts src/shared/browser-bundle-discipline.test.ts src/shared/app-url-discipline.test.ts`:
  **372 passed**, no failures.
- `bun run test:api`: **211 passed**, no failures, including real loopback Hub
  clone admission contracts, concurrent duplicate jobs, owner refusal, cookie
  CSRF/native bearer compatibility and legacy clone tests. Credential/lifecycle/
  folder adapters use disposable real routes in the credential integration suite.
- `bun run api:validate`: passed; existing `WorkspaceConflict` single-schema
  `allOf` warning remains. Revision metadata omissions found during verification
  were corrected, not waived.
- `auditBundle` on live backend and coordinator: **15 / 28 runtime modules**, no
  privileged/test modules or forbidden markers. `git diff --check`: passed.

## Remaining gates

Only 21.4 is newly complete. Adapters alone do not finish 20–21 browser/operation
matrices. Sections 18.3–18.5, 19–20, other 21 tasks and 22–23 remain open as recorded
in tasks.md. In particular no production mount, served-candidate update, browser
retention, physical/native test, external-provider login, push or independent
review occurred here. Historical Chat touch failures, archive-digest mismatch and
unapproved visual goldens remain unwaived. No rollback action is needed: deployed
services still run the previous builds. A future rollout must select a reviewed
candidate and preserve their existing state roots.
