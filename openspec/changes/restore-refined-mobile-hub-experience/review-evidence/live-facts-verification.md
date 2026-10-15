# Bounded live facts and initial API publication — 2026-10-15

## Approved metadata checkpoint

The lead's checkpoint assignment confirms renewed independent approval of the
corrected 18.1 delta, reporting **121 tests passed**, **208 API tests passed**,
both typechecks, production build and strict specification validation passed.
Those unchanged checks are reused here, not represented as fresh checkpoint
reruns. The implementation and correction records below retain their original
self-verification provenance and contrary evidence.

The user now explicitly authorizes suitable commits. This checkpoint contains
18.1 and only the initial publication batch of 18.5 (Hub 12 / Workspace 24), not
completed live integration. Task 18.5 and all later integration/acceptance gates
remain open. No intermediate push, UI mount, service update, deployment, spec
sync or archive is included. The lead assigns the remaining implementation.

Checkpoint publication review covered all 33 changed/untracked files against
HEAD and scanned their full contents for credential-shaped values, private key
material, private runtime/personal paths, credential-bearing URLs and personal
addresses. No new potential unapproved disclosure or private deployment file
was found; address matches were fictional test fixtures. Existing approved Git
identity matches the prior checkpoint. Fresh whitespace and strict change
validation passed. This bounded publication scan is not a full security audit.

## Second independent-review corrections — historical self-verification

Renewed independent review reproduced two remaining Medium defects. This bounded
follow-up repairs them; it is **self-verification, not independent approval**.
The earlier completion/pass records below are historical and do not waive those
findings. No new task beyond 18.1, wire field, revision change or runtime mount.

- **Existing desktop ownership:** ordinary non-layout core settings no longer
  fail the bounded config recognizer. A real generated/stamped linked worktree
  keeps the same Git and file identity with `core.autocrlf=true`, `core.abbrev=7`,
  `core.hooksPath=.githooks`, `core.fsmonitor=true`, editor and an ignored unknown
  core preference. Typed autocrlf/abbrev rejection preserves malformed-config
  detection. HEAD/config/admin-layout validity is separated from richer ref
  facts: valid packed refs larger than the read budget yield unavailable branch
  facts while retaining identity. Actual state polls across cache expiry preserve
  Uatu ownership and absent availability warnings, with zero Git calls/Starts.
  The existing desktop renderer retains Delete for that classification even when
  richer branch facts are unavailable; uncertain/replaced rows still lack it.
- **Truthful SSH lock:** a real successful Lock, external re-addition into the
  test-owned agent, and removal of the managed `.pub` file now yields unknown,
  while an independent `ssh-add -T` using the intact source public key succeeds.
  Public input is bounded, regular/non-symlink and matched to catalog key data;
  invalid input stays unknown. The bounded C-locale probe diagnostic distinguishes
  explicit agent refusal from exit-1 input/tool errors, including a wrapper that
  removes the input after validation. No diagnostic/path is added to public DTOs.
  Suppression, confirmed-lock lifetime, protection reporting and unrelated loaded
  identities retain their existing lifecycle tests.

Red–green command (using the clean-child wrapper below):

```sh
bun test src/hub/checkout-facts.test.ts src/hub/credential-ssh.integration.test.ts \
  -t 'linked HEAD|failed removal suppresses'
```

Before the correction: **0 passed / 2 failed**, missing identity versus Git's
unchanged identity, and `locked` instead of `unknown` despite independently usable
key. After the correction: **2 passed**. The expanded three-file SSH/checkout/pages
run subsequently passed **65 tests**. The first broader run caught two new cleanup
failures (**241 passed / 2 failed**): catalog deletion temporarily removes its
record during cleanup. Passing the cleanup callback's key to the probe, rather
than looking it up in that intermediate catalog, restored the original rollback
and delete-other-key guarantees; no test was weakened.

Final verification:

- Clean-child broader nine-file command below plus `src/hub/pages.test.ts`:
  **244 passed / 0 failed**. Expected injected-failure diagnostics remain.
- Clean-child `bun run test:api`: **208 passed / 0 failed**. The final expanded
  SSH repro (including oversized input and unchanged protection) separately
  reran **1 passed / 0 failed**.
- Final `bun test src/hub/pages.test.ts`: **48 passed / 0 failed**, with the
  Delete-action regression explicitly using the fine-pointer media result.
- Both TypeScript projects and `bun run api:validate`: **passed**, retaining the
  existing single-schema `WorkspaceConflict.allOf` warning.
- Isolated production build: **passed**, 1673 modules, existing `highlight`
  selector warnings. Output was placed only in an approved temporary directory;
  the binary was not executed or selected by a service.
- Strict change validation and `git diff --check`: **passed**. HEAD remains
  `20247bc`; index empty. Earlier unchanged mobile-adapter/bundle and API
  compatibility results are reused, not claimed as fresh reruns. Wire schemas
  are unchanged by this follow-up; revisions remain Hub 12 / Workspace 24.

Remaining limits: this is still a bounded syntax/layout recognizer, not full Git
configuration interpretation. Includes, escapes/continuations, alternate roots
and unknown extensions remain unsupported; ordinary non-layout core preferences
are no longer rejected merely for being unlisted. Richer ref-fact limits no longer
control desktop ownership. SSH variants with unrecognized failure diagnostics
return unknown, never manufactured lock/protection. No UI code or operation guard
was changed; no browser/device/full-project acceptance is claimed. All prior
visual, Chat touch and archive-digest gaps remain open. No existing service,
ambient/global SSH agent/config, private repository, dependency or tool was changed;
no staging, commit, push, PR, deployment, sync or archive.

## First independent-review corrections — historical; superseded above

Independent review withheld approval for three Medium defects. These corrections
are self-verified and ready for renewed review, **not independently approved**.
No commit/push, service change or unrelated fix was performed.

1. **SSH lock evidence:** the shared `explicitLocks` set still suppresses
   autoload after failed removal, but no longer proves a locked fact. Owner-local
   confirmation follows successful removal or a successful Lock with no managed
   agent. Current usable-key evidence overrides it; tool/agent failures remain
   unknown even after a prior Lock. Rebuilds retain suppression, not manufactured
   confirmation. Unlock/re-enable/delete clear confirmation appropriately. The
   public `lock`/`testUsability`/`facts` regression uses a real disposable key/agent
   plus a test-owned failing removal wrapper and refused shutdown: before the
   fix, Lock failed, usability stayed true, but facts said locked; afterwards
   facts say unlocked. It also covers missing executables, exit-2 probe errors,
   external re-addition, successful removal, absent agent, rebuild and suppressed
   autoload without Start.
2. **Checkout identity:** file/stamp inspection now reuses supported bounded
   HEAD/ref/config/layout validation before asserting identity. For a real stamped
   linked checkout with `HEAD=invalid-head`, both Git's context probe and the
   list-only inspector refuse identity authority. Restoring HEAD restores the
   original identity; missing object-directory metadata removes authority again.
   A spawn spy confirms the file inspector runs no Git subprocess.
3. **Conservative config recognition:** malformed/unrecognized configuration now
   returns unavailable, not fabricated unborn. This is a small syntax/critical-
   setting recognizer, not a full Git parser. It accepts ordinary section/key
   lines, plain or wholly quoted values, format 0/1, non-bare common initialization
   booleans, SHA-1/SHA-256 and files refs. Unknown core settings or repository
   extensions, includes, escapes/continuations, worktree config, alternate
   worktree roots and bare layouts remain unsupported. HEAD/ref object-id lengths
   must match the recognized format. The SHA-256 fixture now supplies actual
   format-1/sha256 config, retaining the 64-digit commit assertion rather than an
   inconsistent SHA-1 layout.

Red–green commands, each run before and after its correction:

```sh
bun test src/hub/credential-ssh.integration.test.ts -t 'failed removal suppresses'
bun test src/hub/checkout-facts.test.ts -t 'invalid HEAD or incomplete'
bun test src/hub/checkout-facts.test.ts -t 'malformed or unsupported config'
```

Observed red signals: `locked` instead of `unlocked`, verified identity instead
of unreadable identity, and `unborn` instead of unavailable. The config test
compares malformed inputs against actual Git exit 128; malformed `core.filemode`
also went red before limiting recognition to supported typed core settings. All
three are green. An initial generation-heavy SSH fixture twice timed out in
unrelated supervisor startup; the repro was minimized to the existing unencrypted
import path to reach the actual failed-lock symptom without changing timeouts or
weakening product checks.

Post-correction verification (clean-child wrapper below for credential/Git tests):

- Both TypeScript projects: **passed**.
- SSH/checkout/Git/credential/worktree route command: **106 passed**, across
  `credential-ssh.integration.test.ts`, `checkout-facts.test.ts`,
  `worktree-git.test.ts`, `worktree-api.integration.test.ts` and
  `credential-api.integration.test.ts`.
- `bun run test:api`: **208 passed**. Actual state serialization also checks
  malformed config stays unavailable with legacy branch retained and existing
  zero-Start/zero-spawn assertions intact.
- Nine-file broader command below: **196 passed**, including full worktree
  lifecycle/Start/delete guards, SSH lifecycle/supervisor and credential-context.
  Expected injected-failure diagnostics were emitted by passing tests.
- Focused/route command below (plus the worktree API integration file):
  **492 passed**; API validation and strict change validation passed. Existing
  API single-schema `allOf` warning remains unchanged.
- Baseline compatibility policy: **passed**, still 34 Hub closed-response
  additions accounted for by revision 12 and zero workspace breaks. Isolated
  post-correction production compile: **passed**, 1673 modules; binary not
  executed, existing `highlight` selector warnings retained. Whitespace/index
  checks passed; HEAD remains `20247bc`, with no staging, commit or push.

Original 490/193 counts below are historical pre-review results, not approval of
the defects. Corrected results and limits above take precedence. Wire shapes and
revision decision remain 12/24: no new field, operation, dependency or owner.

## Original slice record

Task 18.1 is complete; only its publication batch under 18.5 is complete.
This is self-verification against isolated test-owned repositories, credentials,
agents and loopback servers, not independent review, browser/device acceptance,
personal-provider testing, or production rollout.

## Entry and actual contract decisions

- Entry was clean at pushed checkpoint `20247bcbc7ded23b6ae8ca05b24998672942f906`.
  No staging, commit, push, PR, production UI mount, service/configuration change,
  personal credential access, installation, spec sync or archive in this slice.
  Existing live 4717/8445 and synthetic 4718/8446 services were not contacted or
  restarted. The compiled check binary was written to a new approved temporary
  build directory, never executed and never selected by a service.
- `HubWorkspace.checkout` is an optional closed discriminated fact: named/unborn
  with `name`, detached with full SHA-1/SHA-256 `commit`, non-Git, or unavailable
  with sanitized `message`. Omission means unsupported/unknown. No wire loading
  state: loading belongs to the frontend read owner. Existing branch/detached
  labels and linked display-name fallback remain compatible and independent.
- `worktree-git.ts` owns capped administrative-file reads (4 KiB small files,
  64 KiB config, 1 MiB packed refs). It distinguishes missing refs from unreadable,
  unsupported, malformed or oversized data; models commondir and loose/packed
  refs; refuses traversal-shaped refs, included configuration and reftable rather
  than fabricating unborn. Bare/nested unsupported layouts remain unavailable.
  No object/tree scan, Git command, workspace Start or polling owner is added.
- Reconciliation uncovered an existing two-second classification cache whose
  expired state GETs ran Git per linked child. The existing worktree service's
  **list-only** classification now uses the same bounded-file owner, canonical
  directory identities, backlink and existing checkout stamp. Full inventory,
  watch/reconciler triggers, Start and delete keep their existing Git authority
  and lifecycle guards. Missing/replaced/uncertain classifications remain intact.
- `PublicCredential.facts` is optional: explicit protection and lock enums plus
  public OpenPGP `userId` or null. SSH facts are produced inside its serialized
  owner; private material never reaches the DTO/browser. Confirmed removal or
  absence, not mere Lock intent, can prove locked; a successful agent check proves
  unlocked; a failed check is unknown.
  OpenPGP reuses its existing listing/cached-signing check rather than a second
  probe. A public UID is decoded there, not parsed by the browser from key text.
  Observed generation proves protection for that owner; imports, older keys and
  rebuilt owners may legitimately remain unknown. This deliberately adds no
  credential-store format/version or protection backfill. Failed cached signing
  never becomes proof of locked or unprotected. Token facts are not applicable.
- `PublicCredentialTool.savedOverride` is optional: omitted means unknown, null
  means automatic discovery, and a string is the saved absolute path. It is
  captured with the manager's existing probe snapshot, independently of `path`;
  GETs never reprobe. Invalid/missing saved overrides remain observable.
- Browser reads now include one explicit tools GET alongside state, credentials
  and default-folder GETs, using the same bounded, cookie-only, no-store transport.
  Decoders project optional facts and map to the existing mobile fact seam without
  interpreting readiness prose or effective paths. No mutation stubs/retries or
  frontend mount. The checked browser bundle has six allowlisted runtime modules.
- OpenAPI, operation inventory, API guide, changelog and contract/route tests are
  aligned. Revisions are **Hub 12 / Workspace 24**: the repository compatibility
  checker treats new fields on closed response objects as breaking for strict
  old validators. The initial no-bump assumption failed the actual baseline
  comparison and was corrected, not waived. No existing field, operation,
  request or stream is removed. New decoders accept old payloads and retain
  unknown when facts are absent; tolerant clients may ignore additions. Strict
  Hub 11 clients must update validators before accepting revision 12.
  `streaming.yaml` needs no change because no event/topic/payload is added there.
  Task 18.5 stays open for subsequent auth/identity/routing and clone contracts.

## Verification commands and observed results

Focused command (**462 passed**, 38 files):

```sh
bun test src/hub/checkout-facts.test.ts src/hub/worktree-git.test.ts \
  src/hub/credential-tools.test.ts src/hub/credential-types.test.ts \
  src/hub/openpgp-credentials.test.ts src/hub/mobile \
  src/shared/api-revisions.test.ts src/shared/browser-bundle-discipline.test.ts \
  src/shared/app-url.test.ts src/shared/app-url-discipline.test.ts \
  src/shell/bounded-fetch.test.ts
```

Final rerun of this command plus `src/hub/worktree-api.integration.test.ts`:
**490 passed**, 39 files.

Broader credential/worktree command (**193 passed**, 9 files), run in a child
test process with inherited `GIT_*` variables removed and PATH restricted to the
**existing Bun launcher directory** plus `/usr/bin:/bin`:

```sh
bun test src/hub/checkout-facts.test.ts src/hub/worktree-git.test.ts \
  src/hub/worktree-reconciler.test.ts src/hub/worktree-api.integration.test.ts \
  src/hub/worktree-onboarding.test.ts src/hub/worktree-lifecycle.integration.test.ts \
  src/hub/credential-ssh.integration.test.ts src/hub/credential-ssh-supervisor.test.ts \
  src/hub/credential-context.test.ts
```

The exact clean-child wrapper used (replace only the child arguments for the
broader command above):

```sh
bun -e 'const launcher = Bun.which("bun");
if (!launcher) throw new Error("Existing Bun launcher missing");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
env.PATH = [launcher.slice(0, launcher.lastIndexOf("/")), "/usr/bin", "/bin"].join(":");
const child = Bun.spawn([process.execPath, "run", "test:api"],
  { env, stdout: "inherit", stderr: "inherit", stdin: "ignore" });
process.exit(await child.exited);'
```

- `bun run test:api` under that clean-child wrapper: **208 passed**, 9 files.
  Includes actual authenticated route serialization, OpenAPI assertions, route
  coverage, revision consistency, old payloads and API compatibility tooling.
- `bun run api:validate`: **passed**, retaining the pre-existing single-schema
  `WorkspaceConflict.allOf` lint warning.
- `bun run typecheck`: **passed**.
- `bun node_modules/typescript/bin/tsc --noEmit -p tests/mobile-hub-review/tsconfig.json`:
  **passed**.
- `bun run scripts/build.ts --outfile="$output_dir/uatu"`, with `output_dir`
  created by `mktemp -d` inside the approved temporary root: **passed**, 1673
  bundled modules. Existing unsupported `highlight` CSS-selector warnings;
  binary not executed, production `dist` and service targets not replaced.
- `openspec validate restore-refined-mobile-hub-experience --strict`: **passed**.
- `git diff --check`: **passed**; no staged files or HEAD movement.
- Direct `compareContracts`/`compareStreamingContracts`/`compareInventories`
  comparison against checkpoint `20247bc`, with `assertCompatibilityPolicy`:
  the initial 11/24 decision failed for additions to closed Hub responses;
  corrected 12/24 decision passes. No workspace-domain break is introduced.

Tests specifically cover all checkout variants, real linked commondir/stamp
identity and replacement, legacy branch preservation on unsupported metadata,
stopped reads with Start counters at zero, Git-call counters unchanged across
multiple expired state polls, protection/lock/UID facts, absent/invalid tools,
saved versus effective paths, no GET reprobing, no echoed sentinel secrets,
strict invalid/private-field rejection, legacy omission, URL scope, timeouts,
401/errors, no retry and production-browser graph separation. Real route checks
use test doubles only where explicitly identified (notably tool/credential
capability outcomes), while disposable SSH lifecycle tests use actual local tools.

## Contrary evidence and limits retained

- The first broad run in the inherited projected environment was **189 passed /
  4 failed**: unchanged credential-context assertions read empty test-owned Git
  settings. Removing inherited `GIT_*` alone did not fix it. Excluding projected
  Git PATH entries made all 28 credential-context tests pass, without source edits.
- A too-small clean PATH then caused **191 passed / 2 failed** in the broad run:
  fake supervisor agents use `#!/usr/bin/env bun`, but this environment's runtime
  executable is named `bun.exe`. Including its directory alone still lacked the
  `bun` launcher. Including the existing launcher directory restored all 32
  context/supervisor tests, followed by the full **193/193** clean run.
- One later inherited-environment API run recorded **206 passed / 2 failed /
  1 error**, including `EPERM` removing a test-owned temporary credential-runtime
  directory during Stop and its consequential missing-operation coverage failure.
  A subsequent clean-child API run passed **208/208**. No product workaround,
  cleanup-policy change or weakened assertion was made; that single cleanup
  failure's precise cause remains unproven, not silently waived.
- Initial new-test failures exposed expected inventory/allowlist changes and
  test-fixture typing/duplicate fingerprints; those were corrected while keeping
  construction/no-retry, closed DTO and browser-separation assertions intact.
- No current full-browser, visual-golden, physical-device/native or full-project
  unit claim. No personal provider test. Authentication identity/generation
  integration and production UI assembly remain next tasks, not simulated success.
  Historical Chat touch 11 failures, archive-digest mismatch, task 8.3 and all other
  open visual/full-matrix gates remain open and unwaived.

That review boundary has now passed per the lead's approval recorded above.
Next the lead may assign **18.2**, authenticated identity/device adapters and real
cookie/CSRF/generation-fencing tests, with new wire facts republished under the
still-open 18.5. No resource deployment is implied.
