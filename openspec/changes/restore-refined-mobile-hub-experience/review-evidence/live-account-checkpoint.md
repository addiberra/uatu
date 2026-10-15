# Live account/Settings implementation checkpoint

This checkpoint is implementation evidence, not final visual acceptance or
independent review. Production HTML routing and the two existing review services
are unchanged. The test-only browser assembly substitutes authenticated HTML
after the real Hub document gate; all account requests reach real Hub routes,
over the existing disposable fake-agent runtimes, not personal providers.

Implemented: separate Agent accounts overview/agent/provider/attempt pages;
capability-based methods, search, conditional fields, masked/cleared inputs,
local errors, cancellation, polling, activation/logout confirmations; focused
Notifications over the existing PWA enrollment owner; contextual complete
credential safety facts retained after advisory dismissal; compact authoritative
checkout groups with stable disclosure and unavailable-checkout action gating.

The inherited password-input callers use the correct fourth `type` and fifth
attribute arguments. Current tests assert actual password input types. Safety
facts remain visible without reintroducing diagnostic/command accordions or a
duplicate in-editor dismissal control. Reused page roots now fence departed
completions and cannot release a newer operation's busy state.

Verification:

- `bun test src/hub/mobile src/pwa/notification-client.test.ts tests/mobile-hub-review/transport.test.ts tests/mobile-hub-review/backend.test.ts src/hub/agent-account-api.integration.test.ts`: 445 passed, including the dedicated page-root race regression.
- `bunx playwright test -c playwright.mobile-live.config.ts`: 4 passed, Chromium
  and WebKit, real-route key validation/refusal/success and Claude code
  refusal/cancel. Initial failures exposed a missing test-assembly Hub meta tag
  and incorrect test selectors/provider assumptions; corrected without mocking
  API responses or weakening product assertions.
- Product and review TypeScript checks passed; `git diff --check` passed.

Still open: complete account generation/device/redirect/expiry browser matrix,
notification browser permission matrix, worktree secondary tasks, production
entry and fixed-scope broker/retention verification, broader credentials,
lifecycle/onboarding/clone browser matrix, full API/build/isolation and desktop
comparison, historical Chat touch failures/archive digest, and all human/native
acceptance gates. No section-19 task is certified complete by this checkpoint.
No running service update or push was performed.
