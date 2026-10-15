# Workspace lifecycle

A workspace has four distinct identities; do not conflate them.

- Display name — the mutable human label (`displayName`). It may duplicate another workspace's name and changes through the display-name operation without touching anything else.
- URL id — the immutable `workspaceId` slug. It routes `/s/{workspaceId}/`, keys personal state and credential assignments, and never changes once assigned — not on display renames and not on folder renames.
- Folder path — the registered source directory. Folder operations may move it; the id and display name survive.
- Session lifecycle — whether a child process is currently serving the workspace. Registration and running are independent: the normal onboarding result is a registered, configured, stopped workspace.

The onboarding flow:

1. Authenticate with the Hub and fetch Hub state.
2. Configure an existing folder (`hubConfigureWorkspace`), create a new repository (`hubCreateConfiguredWorkspace`), or create a clone job for a remote repository. Each accepts a display name, credential selections, and an explicit `start` intent that defaults to false — for example `{ "path": "/src/payments-service", "displayName": "Payments API", "start": false }`. The response is a stopped workspace whose registration and requested credential assignments committed as one result. A failed explicitly requested start still commits the configuration; check `startError` and offer retry rather than treating the workspace as absent.
3. Start the workspace when a session is needed and observe Hub state until it is ready.
4. Open the workspace in a browser at `/s/{workspaceId}/`, or follow it on the live stream by subscribing to its document and conversation topics.
5. Stop a workspace when it no longer needs a process. Forget it only when its Hub registration should be removed.

The legacy registration operation (`hubCreateWorkspace`) remains a compatibility shorthand with its historical start-by-default behavior; new clients should prefer the configure and create operations.

Start and stop are lifecycle operations and may complete asynchronously. Drive UI from later Hub state responses or the live stream's activity topic, not from the fact that a request succeeded.

Forgetting a workspace is different from deleting repository content, and renaming a workspace (display name) is different from renaming its folder. Follow the operation description and response schema in [openapi.yaml](../openapi.yaml); never infer destructive filesystem behavior from a label in client UI.

Workspace state can change outside the requesting client. Reconcile from authoritative state after reconnects and tolerate resources that have already reached the requested state when the documented response permits it.

## Checkout facts

`hubGetState` optionally supplies `workspaces[].checkout`: `named` or `unborn`
with `name`, `detached` with the full commit id, `non-git`, or `unavailable` with a
sanitized message. Omission on older servers means unknown. Prefer this fact to
the legacy `branch` label, which can contain a linked workspace's display-name
fallback. Never invent `main` or interpret unavailable as non-Git.

These reads inspect bounded administrative files without starting stopped
workspaces or spawning Git per row/poll. Reftable, included configuration and
incomplete metadata are deliberately unavailable rather than guessed. Linked
availability/provenance reuse the worktree owner's file/stamp classification;
Start and delete continue to validate through the full existing Git guards.
Runtime state, registration, checkout facts and inherited parent credentials
remain separate. A named branch does not prove a workspace is running or usable.

The file-based list path recognizes a conservative config subset, not all Git
configuration: ordinary section/key lines and plain or wholly quoted values;
repository format 0/1, non-bare layouts, common initialization booleans
(`filemode`, `logallrefupdates`, `ignorecase`, `precomposeunicode`, `symlinks`),
SHA-1/SHA-256 object formats and the files ref store. Ordinary non-layout core
settings, including `autocrlf`, `abbrev`, `hooksPath`, `fsmonitor` and `editor`,
do not invalidate checkout identity. The recognized `autocrlf`/`abbrev` values
are checked, as are the supported initialization booleans; this is not full Git
configuration semantic validation. Unknown repository extensions, includes,
escapes/continuations, per-worktree config and alternate worktree roots remain
unavailable, even if Git itself supports them. Malformed recognized syntax is
also unavailable.

File/stamp inspection validates HEAD, supported config and administrative
directory layout independently of branch-ref contents. A ref read exceeding its
budget can withhold `checkout` facts without losing verified ownership or hiding
the desktop Delete worktree action. Invalid HEAD/config, missing administrative
directories, mismatched backlinks and invalid/replaced stamps still withhold
identity. Full Git Start/delete guards remain authoritative; this list path never
falls back to subprocess probing.

## Credential and tool facts

Public credential responses optionally include `facts` with explicit `protection`,
`lock` and public OpenPGP `userId`. Missing facts, `unknown`, and null user IDs must
not be inferred from names, key text or readiness prose. A missing tool or failed
cached signing check cannot prove locked. OpenPGP protection is known for
generation observed by the current owner; imports, older keys and runtime-owner
replacement may remain unknown. Token protection/lock are `not-applicable`.
No private key, passphrase, token, or secret path is returned.

SSH autoload suppression records Lock intent, not confirmed removal. A failed
removal cannot establish a locked fact; a currently usable key is unlocked.
Even after successful removal, an unavailable agent/tool probe remains unknown.
Missing, malformed, oversized or replaced managed public-key input is unknown,
not proof of lock. Exit 1 alone from `ssh-add -T` is insufficient: only its
recognized C-locale agent-signature refusal supports the earlier confirmed Lock;
other diagnostics (including input disappearing during the probe) stay unknown.
Unrecognized tool variants may therefore return unknown rather than locked.
Confirmed absence with no managed agent can report locked. Rebuilding the owner
retains suppression but not unverified lock evidence; unlock/re-enable clears it.

Tool responses optionally include `savedOverride` independently of effective
`path`: null is automatic discovery; omission is unknown. An invalid saved path
may still be present while readiness is unavailable. Tool GETs return the
existing manager's cached probes and never rediscover/reprobe on read. Test and
override mutations retain their explicit operation ownership and safety rules.
These are optional HTTP fields at revisions 12/24; no stream/topic or mutation
request is added. Older payloads remain supported by the new decoders. Because
the old response schemas were closed, strict Hub revision 11 clients must update
their validators for revision 12; see the API changelog.
