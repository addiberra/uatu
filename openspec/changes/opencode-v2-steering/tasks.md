Each slice is written test first: write the named test and watch it fail, implement until it passes, then run the module's test file. The design references (D1–D13) point to design.md.

## 1. Wire contract and capabilities

- [x] 1.1 Add tests in `src/chat/validation.test.ts`:
  - `QueuedMessage` with `delivery` (`steer`/`queue`, required) and optional `paused: true` is accepted, and an unknown key is still rejected;
  - `conversation.queue` accepts the change kinds `steered`, `switched`, `paused`, and `resumed`, and still rejects an unknown kind.

  Then extend `src/chat/types.ts` (`QueuedMessage`, the `conversation.queue` change kinds) and `parseQueuedMessages` and the queue-event case in `src/chat/validation.ts` until the tests pass.
- [x] 1.2 Add `"steering"` and `"send-now"` to `ChatCapability` (`src/chat/types.ts`) with comments. Add tests asserting the provider descriptors:
  - 2.x declares both (`v2/provider.test.ts`);
  - Claude declares `send-now` only (`claude/provider.test.ts`);
  - 1.x declares neither (`v1/provider.test.ts`).

  Implement the descriptor changes until the tests pass.
- [x] 1.3 Bump `WORKSPACE_API_REVISION` from 24 to 25 in `src/shared/version.ts`. Verify that `bun test src/shared/api-revisions.test.ts` passes.
- [x] 1.4 In `api/openapi.yaml`, add `delivery` (required, `steer`/`queue`) and `paused` to the `QueuedMessage` schema, and add the change kinds `steered`, `switched`, `paused`, and `resumed` to the `conversation.queue` event schema. Verify that `bun test scripts/api-contract` passes.
- [x] 1.5 Add a "Hub 11 / Workspace 25 - Unreleased" entry to the top of `api/CHANGELOG.md`, marked breaking (workspace). List the `QueuedMessage` and queue-event changes, and add migration guidance for strict live-payload consumers. Verify that the compatibility check in `bun test scripts/api-contract` accepts the breaking diff with the revision bump and changelog entry.

## 2. OpenCode 2.x inbox normalization

- [x] 2.1 Add tests in `src/chat/opencode/v2/normalization.test.ts`:
  - `session.inbox.enqueued` (type `user`) yields a pending-inbox delta (id, text, attachments, delivery, time) and **no** `user_message` upsert;
  - `synthetic`, `compaction`, and `move` entries yield no pending delta, and synthetic keeps its current timeline behavior;
  - `delivered` yields a settled delta plus the remembered `user_message` upsert, with the same `message:<id>` id and `requestId` and the delivery time as `createdAt`;
  - `cancelled` yields a settled(cancelled) delta and no timeline item;
  - `delivery.changed` yields a delivery delta.

  Implement the new provider update kind and the memory keyed by inbox id. Remove the events from `IGNORED` until the tests pass.
- [x] 2.2 Add a test in `v2/provider.test.ts`: a `/command` still converges on the inbox id the server minted, both inside the admission window and as a late admission, now that `enqueued` carries no timeline row. Re-key `reportEnqueuedUser` to the pending delta (D4) until this test and the existing command tests pass.
- [x] 2.3 Add tests in `v2/provider.test.ts` against the scripted `fetch` stub:
  - `prompt(delivery: "steer")` sends `delivery: "steer", resume: true` and does **not** call `switchModel` or `switchAgent`;
  - a queue-delivered prompt still applies its model and mode first;
  - `interrupt(id, { resume: false | true })` passes `resume` through;
  - `listPendingInbox(id)` maps `session.inbox.list` to pending user steers only;
  - `cancelInbox(id, inboxId)` calls `session.inbox.cancel`.

  Widen the seam in `src/chat/provider.ts` (`prompt` delivery `"steer" | "queue"`, `interrupt` options, optional inbox operations) and implement these in the 2.x provider until the tests pass. Verify the 1.x and Claude provider tests still pass unchanged.

## 3. Adapter: pending steers and admission

- [x] 3.1 Add tests in `src/chat/adapter.test.ts`, with a fake provider declaring `steering`:
  - a busy prompt with `delivery: "steer"` reaches `provider.prompt` as a steer and is published as `steered`, listed before held messages;
  - a busy steer-delivery command, skill, or `/reload` is held;
  - a busy steer to an agent without `steering` is held;
  - an omitted delivery is held.

  Implement the D6 decision table and the pending-steer map until the tests pass.
- [x] 3.2 Add tests: pending deltas from the provider update the map and publish queue events; a settled(delivered) steer leaves the dock with `delivered`. Snapshot `queued` lists steers first, then held messages, each with its `delivery`. Attach and reconnect replace the map from `listPendingInbox`. Implement until the tests pass.
- [x] 3.3 Add tests for the bound: steers and held messages count together against 20 messages and 256 KiB, a steer raised by another client counts, and an over-bound submission throws `ChatQueueFullError` with the dock unchanged. Implement until the tests pass.
- [x] 3.4 Add tests for the paused state:
  - a steer enqueued before the latest idle, interrupted, or completed transition reads `paused: true` in the snapshot and publishes `paused`;
  - a new steer, or a wake, publishes `resumed`;
  - held messages read `paused` while `deliveryPaused()` is true.

  Implement the derivation (D3) until the tests pass.
- [x] 3.5 Add tests for cancel: `abort` calls `interrupt(id, { resume: false })`, held messages go dormant as today, pending steers stay pending and paused, and nothing is delivered. Implement until the tests pass.
- [x] 3.6 Add tests for undo on a steering agent: the replacement under a staged revert goes out as a steer with `resume: true`, held messages stay held, paused steers are delivered with it oldest first, and on a non-steering agent the path is unchanged. Implement until the tests pass.

## 4. Adapter: per-entry operations

- [x] 4.1 Add tests for withdrawing a steer (remove, edit, or switch to queue):
  - `inbox.cancel` followed by a `cancelled` delta removes the steer, or holds it at its submission-order position with the session's current configuration frozen;
  - a `delivered` delta arriving first throws `SteerAlreadyDeliveredError` and leaves nothing held and no second delivery;
  - with no event before the bounded wait, the outcome is decided from `listPendingInbox` and history;
  - retries with the same request id apply once.

  Implement D7 in the admission lane until the tests pass.
- [x] 4.2 Add tests for switching a held message to steer, or Send now on a steering agent: the message leaves `heldQueues` (`switched`) and goes to `provider.prompt` as a steer with its attachments, and a dormant queue stays dormant for the other entries. Send now on a paused steer calls `interrupt(id, { resume: true })`. Commands are refused a switch to steer. Implement until the tests pass.
- [x] 4.3 Add tests for Send now on a `send-now` agent without `steering` (Claude-shaped fake): it is refused while a turn is active. When dormant or idle, it dispatches that message under its frozen configuration ahead of the others, publishes `delivered`, and leaves the rest held in order. An agent without `send-now` refuses it. Implement until the tests pass.

## 5. Service, routes, and client API

- [x] 5.1 Add tests in `src/server/chat-routes.test.ts`:
  - the prompt route accepts and validates `delivery`;
  - `PATCH …/queue/:messageId {requestId, delivery}` and `POST …/queue/:messageId/send-now {requestId}` are origin-protected and idempotent, and map `SteerAlreadyDeliveredError` to 409 with a distinct code and unsupported operations to their refusal;
  - `DELETE` withdraws a steer.

  Add the operations to `WorkspaceChatService` (`src/chat/service.ts`), register the routes once in `src/server/routes.ts`, classify them as internal exclusions in the contract coverage, and add the calls to `src/chat/client.ts` until the tests pass. Verify that the contract route-coverage check passes. If the changelog entry from 1.5 lists routes, add the new internal routes there.

## 6. Composer and dock UI

- [ ] 6.1 Add unit tests for a delivery-preference helper: it is stored per device in `presentationLocalStorage()`, defaults to `steer`, and unknown values fall back to `steer`. Implement until the tests pass.
- [ ] 6.2 Add `QueueDockRenderer` tests in `src/chat/timeline-renderer.test.ts`:
  - steers render before queued entries with "Steer" and "Queue" labels and a paused note;
  - the model note shows only while a steer is pending;
  - actions depend on capability and state: Remove and Edit always; Steer or Send now on queued entries; Queue on steers; "Send now (all paused steers)" on paused steers; no Steer action on commands.

  Implement until the tests pass.
- [ ] 6.3 Wire the composer in `src/chat/ui.ts`:
  - Enter and ⌥Enter choose the delivery while a `steering` conversation is busy;
  - the delivery menu sits inside the Send/Cancel footprint (`src/index.html`, `src/styles.css`);
  - dock actions call the new client operations;
  - Edit loads the composer only after a successful withdrawal;
  - a 409 already-delivered answer shows "Too late — already delivered";
  - when Undo succeeds while steers are pending, the undo confirmation names those steers and says they go out with the replacement.

  Verify with the e2e tasks in section 7 and the existing composer rail-stability e2e test.

## 7. End-to-end harness and scenarios

- [ ] 7.1 Build `tests/e2e/opencode-v2-fake.ts`: a scripted fake OpenCode 2.0.28 HTTP and SSE server implementing the routes the 2.x provider calls, including the inbox list and cancel, prompt with delivery and resume, and interrupt with resume. It is controlled through `/__e2e/chat`. Register it in `tests/e2e/server.ts` as an agent served by the real `ChatAdapter` and `OpenCodeV2Provider` (D13). Verify with a smoke test: a conversation is created, a prompt answers, and history reloads.
- [ ] 7.2 Add `tests/e2e/chat-steering.e2e.ts` against the fake with these scenarios:
  - Enter steers and the steer delivers at a scripted step boundary, entering the timeline only then;
  - ⌥Enter queues;
  - switch queued → steer, and steer → queue;
  - remove and edit a steer;
  - the too-late race shows the notice and one timeline row;
  - cancel pauses steers;
  - Send now wakes the paused steers;
  - commands always queue;
  - reload keeps the dock;
  - the menu on a touch viewport.

  Capture screenshots through `tests/e2e/evidence.ts`. Verify that `bun run test:e2e -- chat-steering` passes.
- [ ] 7.3 Extend `FakeE2EChatService` with `send-now`, and add a Claude Send now scenario to `tests/e2e/chat-queue.e2e.ts`: cancel leaves the queue dormant, Send now delivers the chosen message, and the others stay held. Verify that a running Claude conversation shows no Send now and no steer choice. Verify that the whole `chat-queue` suite passes.

## 8. Coverage, docs, and final verification

- [ ] 8.1 Update `src/chat/opencode/sdk-coverage.ts` (D12) and run `bun run coverage:agents`. Verify that the report lists the inbox events and operations as mapped, with `session.inbox.update` as deliberately unused.
- [ ] 8.2 Update `ARCHITECTURE.md` where it describes the chat queue (steer ownership, dock), and the `src/chat/` entry in `CLAUDE.md` if the module map changes. Verify by review.
- [ ] 8.3 Run `bun run test:ci`, `bun run test:e2e`, and `bun run build`. All must pass.
- [ ] 8.4 Do one manual pass against a real OpenCode 2.0.28 binary (`bun run dev`):
  - steer mid-turn;
  - steer → queue before the boundary;
  - the already-delivered race;
  - cancel, then Send now;
  - undo with a pending steer.

  Record the results in the PR body.
