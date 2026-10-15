# Live mobile worktree checkpoint

The phone task owner now reuses the published worktree inventory, fetch, create,
open/inspect, register, forget, preflight-delete and delete routes. Git, identity,
provenance, lifecycle queues and local-data checks remain with upstream services.
No new API revision is required: these are existing published operations and
decoders, not a new wire contract. Desktop dialogs are unchanged.

HTTP-200 `ok:false` is rendered as refusal, with operation identity, phase,
recovery and retained checkout where supplied. Missing/replaced checkouts cannot
Open/Register. External deletion remains a server refusal. Forget confirms stop,
shell termination and preserved files/provenance. Delete preflights the exact
checkout and requires acknowledgement of disclosed local data; it echoes only
that fingerprint and never supplies force. Creation commits exact local/remote
refs and keeps drafts on fetch refusal without silently substituting a vanished
selection. Workspace Start remains reachable through the common credential owner.

Verification (self-review, not independent validation):

- `bun test src/hub/mobile/worktree-flows.test.ts src/hub/worktree-api.integration.test.ts`:
  32 passed, 247 assertions. Disposable real Git repositories and real Hub APIs;
  session backend is a double. Adapter coverage includes external registration,
  ownership-preserving forget/re-register, fetch refusal, invalid branch and
  dirty deletion. Flow checks cover missing/replaced gating, preflight refusal,
  exact selection and retained partial creation without false success.
- `bunx playwright test -c playwright.mobile-live.config.ts`: 10 passed,
  Chromium/WebKit. Authenticated HTML assembly remains test-only; APIs are real,
  agents are disposable fakes. No personal provider login or executable PTY claim.
- Product and review TypeScript projects passed.

Production assembly, broader live retention/lifecycle/credential/clone browser
matrices and release/visual/native gates remain open. No deployment, restart,
push, spec sync or archive performed.
