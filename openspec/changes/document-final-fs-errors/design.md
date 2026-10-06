## Context

See proposal.md, "Why". Current state:

- `documentErrorStatus` (`src/server/render-dispatch.ts`) maps the message `document not found` and the codes `ENOENT`/`ENOTDIR` to 404, the message `document is binary` to 415, and everything else to 500. The `/api/document` handler (`src/server/routes.ts`) logs only the 500 branch.
- `renderDocument` can fail at two points: `fs.readFile(document.id, "utf8")`, which raises errno errors, and the Markdown or AsciiDoc renderer, which raises plain errors. `collectFileFacts` swallows its own failures, and an invalid UTF-8 byte sequence does not throw.
- `loadDocument` (`src/preview/mount.ts`) wraps `fetch()` and `response.json()` in one `try`, so a JSON parse failure lands in the same `catch` as a network failure (`failedStatus = null`, transient). `isTransientDocumentFailure` (`src/preview/load-retry.ts`) is `status === null || status >= 500`. Every final failure shows the 404 text "File unavailable. It may have been removed…", including a 415, a 400, or a hub 401.
- The hub proxy (`src/hub/proxy.ts`) passes an upstream status through and answers 502 when the session is unreachable. `/api/document` is internal (`api/exclusions.yaml` → `workspace-api`), so no published contract changes.
- Other callers do not retry: `fetchDocumentView` (split completion) returns `null` on any failure, and outline copy-source flashes a failure icon. Neither needs to change.
- No main spec describes this behavior yet. #462 shipped it without a spec delta, so this change adds the requirement to `document-watch-index`.

## Goals / Non-Goals

**Goals:**
- A failure that will not recover on its own takes one request and shows one notice that names its cause.
- A failure that may recover keeps its bounded retries, and a renderer bug stays visible in the session log.
- The classification is a pure function on each side (server status mapping; client failure kind → transient? and → message), unit-tested without a browser.

**Non-Goals:**
- Keeping the last good render while the same document retries (tjakobsson/uatu#468). The failure classification added here is the input that change will need.
- The `/api/document/diff` error mapping. Its client does not retry.
- Auto-recovery when permissions are fixed. A `chmod` changes ctime, not mtime, and the watcher is not guaranteed to report it, so the notice tells the user to select the file again.

## Decisions

### D1. Status for each failure condition

| Condition | Code / signal | Status | Body `error` | Logged | Why |
|---|---|---|---|---|---|
| Id not in index | message `document not found` | 404 | `document not found` | no | unchanged |
| File vanished | `ENOENT` | 404 | `document not found` | no | unchanged; the watcher reports the change |
| Path component became a file | `ENOTDIR` | 404 | `document not found` | no | unchanged |
| Path became a directory | `EISDIR` | **404** (was 500) | `document not found` | no | The indexed *file* is gone; this mirrors `ENOTDIR`. The watcher sees the unlink and add, and the live topic re-fetches. |
| Symlink loop | `ELOOP` | **404** (was 500) | `document not found` | no | The path cannot resolve to a file, which is the same outcome as a dangling symlink (already `ENOENT` → 404). It is stable until someone edits the links. |
| Name too long | `ENAMETOOLONG` | **404** (was 500) | `document not found` | no | Deterministic for a given path. It is unlikely, because ids come from the index, but retrying it is pointless. |
| Permission denied | `EACCES` | **403** (was 500) | `document not readable` | no | Stable until a person changes the permissions. 403 is the HTTP meaning, and "removed" would be false. |
| Operation not permitted | `EPERM` | **403** (was 500) | `document not readable` | no | On macOS, TCC privacy protection and immutable flags surface as `EPERM` when a file is read. For the user this is the same condition as `EACCES`. |
| Binary | message `document is binary` | 415 | `document is not viewable` | no | unchanged |
| Renderer throw, `EMFILE`, `ENFILE`, `EAGAIN`, `EBUSY`, `EIO`, unknown | anything else | 500 | `document render failed` | yes | Either the server is failing or the failure may clear. Retrying is bounded. |

`documentErrorStatus` widens its return type to `403 | 404 | 415 | 500`. The handler gains a 403 branch.

**Alternatives:**
- *`EACCES` → 404 (as in v0.7.0).* Rejected: the "removed" notice would lie.
- *`EISDIR` → 415 or 422.* Rejected: 415 means "binary, not viewable" to the client, which already routes binaries before fetching. A directory is not a document at all. 404 matches `ENOTDIR` and the watcher follow-up.
- *Treat `EIO` as stable.* Rejected: on network and FUSE filesystems `EIO` is often transient. Retrying a truly bad disk costs five reads, and the log records the cause.
- *Generic "any errno except a known transient list is final".* Rejected: an unknown failure should fail loud and retry, as the issue asks for renderer throws. An allowlist of stable codes keeps that default.

### D2. No server log for 403

A 403 is about the document, not the server, and the client now explains it. That treats it like 404 and 415. Logging it would bring back one log line per view (five fewer than today, but still noise for a condition the user can see). *Alternative:* log once per document id. Rejected for now because it needs per-session dedupe state for little value. It remains an open question for the user.

### D3. The client picks the message; the body carries a stable tag

Notice text lives in the client, chosen from the failure kind. The server body stays a short machine tag and never echoes `error.message` or the path (security posture is unchanged). The permission notice requires both `status === 403` and `error === "document not readable"`. Any other 403 (for example a future hub-level refusal) gets the generic final notice, so it is never mislabeled as a file-permission problem. *Alternative:* the server sends display text. Rejected: it couples the wording to the server and makes leaking a cause easier.

### D4. Client failure kinds: fetch, body read, and parse are classified separately

`loadDocument` builds one `DocumentLoadFailure`:

- `{ kind: "no-answer" }`: `fetch()` threw, or `response.text()` threw because the body stream broke. **Transient.**
- `{ kind: "status", status, error? }`: a non-OK response (`error` is read best-effort from a JSON body). Transient when `status >= 500`, final otherwise.
- `{ kind: "unreadable" }`: an OK response whose text fails `JSON.parse`, or whose parsed value is not an object with a string `html`. **Final.**

`isTransientDocumentFailure(failure)` and a new `documentFailureMessage(failure, retrying)` live in `load-retry.ts` so both can be tested without a DOM. The interim and exhausted transient notices keep their current text.

The issue says "only a thrown `fetch()` maps to null". This design also treats a broken body stream as no answer, because that is a network failure that arrives after the headers, not a bad answer. Reading the body with `text()` and then parsing it apart from the read is what makes the distinction possible. `response.json()` would merge the two into one rejection.

### D5. The retry schedule stays `[250, 1000, 3000, 10000]` ms

With stable conditions removed from the 5xx class, what remains is resource exhaustion, a session child restarting behind the hub (502), a broken connection, and renderer throws. The 14 s window covers a session restart and an `EMFILE` spike. The first retry at 250 ms covers a save race. A deterministic renderer bug costs five requests and five log lines per view, which the issue explicitly accepts so the bug stays visible. The key per selection and activation and the "a request restarts the schedule, a retry continues it" rule are unchanged. *Alternatives:* fewer attempts (shorter "Retrying…", but a session restart that takes longer than about 4 s would end on a failure) or an unbounded backoff (rejected in #462). Neither is needed once stable failures are final.

## Risks / Trade-offs

- [A permission fix is not observed by the watcher] → The notice says "then select it again". A re-selection makes exactly one request.
- [`chmod 000` cannot deny root a read, so tests running as root would render the file] → Unit and e2e permission tests use `skipIf(process.getuid?.() === 0)` (the existing pattern in `render-dispatch.test.ts`) and restore `0o644` in `finally` so fixture cleanup and the watcher are unaffected. CI runners are non-root `ubuntu-latest`. Windows is not a supported platform. On macOS the e2e also runs as the user.
- [The watcher may react to the mode change] → The e2e changes the mode before the first selection, and it asserts on the settled request count (a poll that stays at 1 past the first retry delay), not on a fixed sleep.
- [A stale tab from before the upgrade meets the new server] → An old client treats 403 as final (`< 500`) and shows its 404 text. That is acceptable, and the freshness handshake reloads the tab anyway.
- [`EIO` from a dead disk is retried] → Bounded at five reads, each logged with its cause.

## Migration Plan

None. Client and server ship in one build, there is no data, and a revert undoes the change.

## Open Questions

- The exact notice wording can be polished during review without changing the classification.
