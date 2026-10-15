# Clone jobs

Clone jobs let the Hub acquire a remote repository without holding a long HTTP request open.

1. Create a job with the documented clone request. The checkout folder name, workspace display name, clone credential, retained workspace authentication/signing, and `start` intent are independent fields: the clone credential authenticates only the clone and is never retained as a workspace assignment unless explicitly listed, and `start` defaults to false.
2. Subscribe to that job's event stream before prompting for additional input.
3. Render progress and terminal states from typed events in [streaming.yaml](../streaming.yaml).
4. If output requests input, submit it only through the job input operation. There is no separate input event; mask every response regardless of the prompt's wording.
5. On success, use the resulting workspace identifier and the `running` flag: `running: false` (the default outcome) is a registered stopped workspace, not a session to navigate into. A `start-failed` result carrying a `workspaceId` means the configuration committed and the stopped workspace was preserved. On failure or cancellation, retain the reported error for the user.

Job identifiers are opaque. Event ordering, replay identifiers, terminal events, and reconnect rules are part of the streaming contract, not conventions to infer from examples.

Cancellation is a request to the job controller. Continue consuming the stream until a terminal event confirms the outcome, and do not treat a dropped connection as cancellation.

## Recovering lost acceptance (Hub revision 14)

Generate a fresh opaque `attemptId` and save that non-secret identity before
submitting `POST /api/hub/clone-jobs`. An identical request with the same id and
authenticated user returns the original job, including concurrent submissions.
Reusing an id with different fields returns 409; another owner receives 404.
Legacy callers omitting `attemptId` retain their non-idempotent behavior.

After a lost response, POST `/api/hub/clone-attempts/{attemptId}/reconcile`:

- `accepted` supplies the original `jobId`; reconnect, never create another job.
- `not-accepted` durably fences that id, including any delayed submission. A new
  explicitly authorized submission must use a new id.
- `pending` means admission is still running. Reconcile again, not resubmit.
- `expired` means the accepted job has expired or a restart left admission
  unresolved. It does **not** prove that no checkout or registration was created.
- HTTP 503, malformed responses or connection loss leave acceptance unknown.
  Do not infer nonacceptance from a missing dashboard entry or missing job.

Reconciliation changes durable state and requires the usual cookie CSRF checks
(native bearer transport remains supported). All responses are no-store. The
leased Hub state root stores only hashes of owner/request plus admission status
and job identity, not URL, credential or prompt material. Records survive restart
and are never silently evicted. At 10,000 records, new admission/fencing fails
closed with 503; existing records remain readable. Removing tombstones destroys
the safety guarantee and is not an automatic cleanup/retry mechanism. Jobs remain
in-memory and normally expire five minutes after completion; a restart does not
recreate them. This additive operation does not alter the existing event schema.

Revision 14 also publishes the optional structured onboarding-error `code` used
to distinguish initialization, retained-folder and recovery failures. Older
payloads without it remain readable; clients must not infer codes from tool prose.
