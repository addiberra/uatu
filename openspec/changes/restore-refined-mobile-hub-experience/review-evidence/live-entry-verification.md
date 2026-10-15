# Production mobile entry checkpoint

This is candidate-source implementation and self-verification, not independent
review, deployment approval, final visual acceptance or a physical-device test.
The existing live/synthetic services and private parallel runtime are unchanged.

## Assembly and authority

- `src/workspace-entry.ts` retains the existing app default for standalone and
  desktop. Eligible Hub touch entry installs the same-document coordinator before
  one lazy app boot, using the injected fixed base path and original document URL.
- The authenticated `/`, `/settings?detail=…` and `/clone` documents load a
  compiled product HTMLBundle. The pre-paint phone decision uses the existing
  scoped presentation key and coarse-pointer default. Only that selected phone
  branch skips/removes the legacy controller/forms; desktop rendering stays intact.
- Direct Hub entry owns task history and read refresh, but no fabricated workspace
  or stream. Auth loss stops background refresh from replacing a login draft.
  Canonical Open establishes the workspace document; subsequent ordinary detours
  retain it. Mode escape, cross-workspace Open and invalidation reload boundaries
  remain explicit.
- Workspace recovery reuses the existing broker, HTTP/WS URL owners, Hub auth and
  session-running signals. Transport loss alone is not Stop. Per-workspace fences
  cancel pending Start/Return without discarding an authenticated management
  command's result when its dependent Stop occurs first. The new race regression
  failed before separating these generations and passed afterward.
- Notifications has one existing enrollment owner in focused Settings; retained
  phone workspaces do not also mount the desktop dialog. All worktree, account,
  credential, lifecycle, onboarding and clone adapters are reachable, not stubs.
- Public revisions stay **Hub 14 / workspace 24**: this assembly consumes existing
  contracts. New static assets carry no protected data. API/browser traffic keeps
  its auth, CSRF and origin checks. Only a bounded, credential-free self-fetch of
  this server's static bundle template permits its configured TLS certificate.
  Extracted tags are reconstructed using only the existing root-relative bundled
  asset namespace: external URLs, application/API paths and event attributes
  cannot enter the page through that fetch. Adversarial unit checks cover this.

## Evidence provenance

`playwright.mobile-live.config.ts` now uses production HTML/assets without HTML
substitution. APIs reach real Hub owners over disposable test resources. Agent
logins use the existing fake account runtimes; notification platform APIs are
explicit doubles; the new optional clone process double spawns no Git/network/PTY.
Live retention uses the existing deterministic private-home PTY harness and fake
Chat provider. These are not personal-provider or OS push-delivery tests.

The synthetic reviewer still substitutes only its test entry/transport and fails
closed. Its config accepts `UATU_MOBILE_REVIEW_PORT` so verification can use an
unused listener without stopping the existing process on 4703. No fixture,
scenario controller or privileged server module is allowed in either browser
entry's graph.

Checks already executed before the final expanded matrix:

- `bun run api:validate`: valid; unchanged single-schema `WorkspaceConflict`
  `allOf` lint warning.
- `bun run test:api`: **212 passed**, 1,851 assertions.
- Focused mobile/PWA/bundle/transport/worktree suite: **486 passed**, 5,772
  assertions before the additional generation and document tests.
- Product and review TypeScript projects passed after the expanded browser cases.
- `bun run build` and isolated `bun run smoke` passed, including compiled desktop
  worktree controls and compiled phone Hub/logo/assets → workspace → Settings →
  Return with exact root identity and no page errors. The smoke ran with a new
  private HOME and the installed browser cache explicitly selected. An earlier
  attempt lacked that cache path and hit a guardian cold-start timeout; a focused
  guardian check then returned code 2 in 467ms and both later smokes passed.
- Browser iterations caught test precondition/selector errors (hidden legacy
  forms, exact upload route, an enable action that needs no confirmation, and the
  fixture's missing clone-attempt store), not silently accepted failures. Phone
  assembly now removes the duplicate legacy form tree. Full rerun results follow
  separately; partial earlier matrices are not reported as all-green.

### Expanded live browser result

`bunx playwright test -c playwright.mobile-live.config.ts`: **46 passed**, both
Chromium and WebKit, production documents/assets and real Hub routes. Includes
all four surfaces/one boot/one broker/one terminal attachment, Back/Forward,
direct/reloaded Settings with no fabricated workspace, cold loading Back and
late completion, manage B/Return A, external Stop/revoke, exact File identity and
one pending upload, draft/broker/PTY progression, hidden-input and nonzero resize
guards, and the coordinated assignment Stop/result race. Worktree, account,
notification, create/Forget, token and lost-clone-acceptance cases also pass.

The preceding **45/46** iteration exposed a WebKit multipart MIME refusal when
the test replayed a browser upload via `route.fetch()`. Holding then continuing
the original browser request preserved its multipart bytes; the real upload must
still return **201**, and the exact File/one-upload/retention assertions remain.
The focused case passed in both engines, followed by the complete 46-case pass.
No product upload handling, assertion or golden was weakened.

A broad worktree/mobile unit run reported **793 pass / 3 fail**: the expanded
multi-operation adapter test exceeded its 5s deadline, and the strict later Git
counter differed by three calls (unfinished-work contamination is suspected,
not established independently). The document test also read a newly
edited expectation against that run's already-cached module. The adapter checks
are now split into smaller deletion and registration scenarios with the original
assertions and deadline retained. A stable-source rerun is required and recorded
separately; this failed run is not called green.

The stable-source repeat of that same broad unit command passed **797 tests**,
**0 failures**, **7,781 assertions**, across 53 files. No deadlines, Git-counter
assertions or fault-injection checks were removed. The current production build,
both TypeScript projects, bundle graph guards and `git diff --check` also pass.

The existing listener on 4703 was detected and preserved. A separate synthetic
verification can use an unused port, for example:

```sh
UATU_MOBILE_REVIEW_PORT=4793 bun node_modules/@playwright/test/cli.js test -c playwright.mobile-hub-review.config.ts tests/mobile-hub-review/continuity.e2e.ts
```

Check that the selected listener is free first; Playwright starts and stops only
its own test server. This command does not restart an existing reviewer.
Use Bun for this suite: its test imports include Bun-supported file assets; a
Node-based `bunx playwright` launch fails before running those cases.

## Unwaived obligations

The broader credential/onboarding/clone exceptional browser matrices, exact live
scroll/geometry/reconnect coverage, complete current synthetic/regression suites,
desktop/native comparison and final evidence reconciliation require their named
checks. Tasks stay open until verified, not merely adapter-connected.

The historical archive still has 25 files with digest
`34055380d75c874bec9ca8d0cf34ec07ac5006e46103241dacecabdcbb6a1d23`, unchanged
against `c259efb`; it still differs from the original dirty-tree aggregate. That
baseline has no per-file data to recover the cause. `baseline.ts verify` still
fails, and neither it nor any golden was changed. Historical Chat touch failures
also remain unwaived pending their current reproduction and lead scope decision.
Physical/native checks, version-specific human acceptance (8.3), and lead-reviewed
service scope (23.2) remain separate. No push, deployment, spec sync or archive.
