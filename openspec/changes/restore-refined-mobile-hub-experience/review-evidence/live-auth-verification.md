# Live authentication milestone

Task 18.2 self-verification; not independent review, production mounting, browser
acceptance, or deployment approval. Existing running services were not touched.

- Added browser-only bounded transport and authentication/device adapters. Each
  request remains Hub-scoped behind a workspace URL, uses same-origin cookies,
  no-store and redirect refusal, and never automatically retries a write.
- Login explicitly requests a cookie-only response. Native callers still receive
  their documented bearer response. JSON login does not carry a next target;
  existing validated HTML return paths and rate limits remain unchanged.
- Authenticated state publishes configured user and runtime hostname, only behind
  the existing gate. Anonymous identity/version checks pass. Device wire seconds
  convert to browser milliseconds; only public handles reach the adapter.
- Authoritative 401, current revoke and sign-out invalidate generations. Late
  responses, including a 401 arriving after timeout, cannot restore/invalidate a
  newer context. Transport failures and ambiguous mutations remain indeterminate.
- Published Hub revision 13 / workspace 24, response variants, metadata and
  changelog. No stream changes in this milestone. Section 18.5 stays open for
  later routing/clone publication.

## Checks

- `bun test src/hub/hub.integration.test.ts`: 80 passed, including new cookie-only
  login, CSRF, safe JSON return behavior, authenticated identity, anonymous
  nondisclosure, current revoke and JSON cookie logout. Uses disposable real Hub
  services; existing tests cover native bearer, other-device revocation, invalid
  and rate-limited login, proxy origins and safe form next paths.
- `bun run test:api`: 209 passed. Initial runs caught missing revision metadata
  and the old bearer-only logout contract assertion. Metadata was aligned and
  that assertion now checks **both** supported transports; native coverage remains.
- `bun run api:validate`: passed; existing WorkspaceConflict single-allOf warning.
- `bun test src/hub/mobile src/shared/browser-bundle-discipline.test.ts`: 348
  passed, including nine new adapter/race/failure tests.
- `bun run typecheck` and review TypeScript project: passed.
- Existing `auditBundle` for live-auth and live-transport: no forbidden modules;
  each contains three browser-safe runtime modules, no fixtures or privileged
  server imports. Diff whitespace check passed.

Self-review covered response projection, secret handling, cookie/native
compatibility, no-store, CSRF reuse, ambiguous effects and timeout/generation
fences. No dependencies, operator configuration, personal credentials, service
state or archived evidence changed. Full production mounting and live browser
continuity remain tasks 18.3–22; no visual/native/device acceptance is claimed.
