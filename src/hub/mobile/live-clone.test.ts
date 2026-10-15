import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { createLiveTransport } from "./live-transport";
import { createLiveClone, decodeCloneAttempt, decodeCloneEvent } from "./live-clone";
import type { CloneStreamEvent, CloneSubmissionIntent } from "./backend";
import type { Fetcher } from "../../shell/bounded-fetch";

const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeEach(() => { Object.defineProperty(globalThis, "document", { configurable: true, value: parseHTML('<html><head><meta name="uatu-hub" content="true"></head></html>').document }); });
afterEach(() => { if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document"); });
const credentials = { readCredentials: async () => ({ status: "available" as const, value: [] }) };
const intent: CloneSubmissionIntent = { attemptId: "disposable-attempt", url: "https://example.test/repo", dest: "/fixtures", folderName: "repo", displayName: "Test", credentialId: null, retainedAuthentication: [], signing: null, start: false };

test("live clone omits null identity, preserves retained policy and never retries a lost write", async () => {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => { calls.push(url); expect(JSON.parse(init!.body as string)).toEqual({ ...intent, credentialId: undefined }); throw new Error("connection lost"); };
  const clone = createLiveClone(createLiveTransport({ fetch: fetcher }), credentials, { fetch: fetcher });
  expect((await clone.submitClone(intent)).status).toBe("indeterminate");
  expect(calls).toEqual(["/api/hub/clone-jobs"]);
});

test("HTTP refusal alone never clears unresolved admission; authoritative fencing or acceptance does", async () => {
  for (const status of ["pending", "expired", "not-accepted", "accepted", "unavailable"]) {
    let writes = 0;
    const transport = createLiveTransport({ fetch: async url => {
      if (url.endsWith("clone-jobs")) { writes++; return Response.json({ error: "private-tool-output" }, { status: 409 }); }
      return Response.json({ status, ...(status === "accepted" ? { jobId: "original" } : {}) }, { status: status === "unavailable" ? 503 : 200 });
    } });
    const result = await createLiveClone(transport, credentials).submitClone(intent);
    expect(result.status).toBe(status === "accepted" ? "completed" : status === "not-accepted" ? "rejected" : "indeterminate");
    expect(writes).toBe(1); expect(JSON.stringify(result)).not.toContain("private-tool-output");
  }
});

test("reconciliation is POST, stays Hub scoped, and refuses malformed states", async () => {
  const transport = createLiveTransport({ fetch: async (url, init) => {
    expect(url).toBe("/api/hub/clone-attempts/disposable-attempt/reconcile"); expect(init?.method).toBe("POST");
    return Response.json({ status: "pending", jobId: "not-accepted-yet" });
  } });
  expect((await createLiveClone(transport, credentials).reconcileCloneAttempt(intent)).status).toBe("unavailable");
  expect(() => decodeCloneAttempt({ status: "accepted" })).toThrow();
});

test("stream replay uses fixed job/cursor, ignores duplicates and preserves partial terminal facts", async () => {
  const events: CloneStreamEvent[] = [];
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const stream = 'id: 2\nevent: phase\ndata: {"phase":"cloning"}\n\nid: 3\nevent: output\ndata: {"output":"prompt"}\n\nid: 4\nevent: result\ndata: {"status":"start-failed","workspaceId":"saved","target":"/retained","error":"private-tool-output"}\n\n';
  const fetcher: Fetcher = async (url, init) => {
    expect(url).toBe("/api/hub/clone-jobs/original/events"); expect(new Headers(init?.headers).get("last-event-id")).toBe("2");
    expect(init?.credentials).toBe("same-origin"); expect(init?.redirect).toBe("error");
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  };
  const stop = createLiveClone(createLiveTransport(), credentials, { fetch: fetcher }).subscribeClone({ jobId: "original", afterEventId: 2 }, event => { events.push(event); if (event.type === "job-event" && event.event.type === "result") finish(); });
  await done; stop();
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({ type: "job-event", event: { id: 4, type: "result", data: { status: "start-failed", workspaceId: "saved", target: "/retained" } } });
  expect(JSON.stringify(events)).not.toContain("private-tool-output");
});

test("current-session invalidation drops late clone frames without cancelling the job", async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  const transport = createLiveTransport(); const events: CloneStreamEvent[] = [];
  const stop = createLiveClone(transport, credentials, { fetch: () => pending }).subscribeClone({ jobId: "original", afterEventId: 0 }, event => events.push(event));
  transport.invalidate("current-session-revoked");
  resolve(new Response('id: 1\nevent: output\ndata: {"output":"late"}\n\n', { headers: { "content-type": "text/event-stream" } }));
  await pending; await Promise.resolve(); stop(); expect(events).toEqual([]);
});

test("clone 401 invalidates, 404 expires, and network failure is only disconnection", async () => {
  for (const status of [401, 404, 500]) {
    const transport = createLiveTransport(); const invalidations: unknown[] = [];
    transport.subscribeInvalidation(event => invalidations.push(event));
    let resolve!: (event: CloneStreamEvent) => void;
    const received = new Promise<CloneStreamEvent>(done => { resolve = done; });
    const stop = createLiveClone(transport, credentials, { fetch: async () => Response.json({}, { status }) }).subscribeClone({ jobId: "original", afterEventId: 0 }, resolve);
    expect(await received).toMatchObject({ type: status === 500 ? "disconnected" : "unavailable" });
    await Promise.resolve(); stop(); expect(invalidations.length).toBe(status === 401 ? 1 : 0);
  }
});

test("event decoders reject impossible success and retain timeout reasons", () => {
  const frame = { id: "1", event: "result", data: JSON.stringify({ status: "succeeded", target: "/x", workspaceId: "saved" }) };
  expect(() => decodeCloneEvent(frame)).toThrow();
  expect(decodeCloneEvent({ ...frame, data: JSON.stringify({ status: "timed-out", target: "/x", reason: "inactivity" }) })).toMatchObject({ data: { status: "timed-out", reason: "inactivity" } });
});

test("input is sent once; cancellation acknowledgement cannot claim terminal job outcome", async () => {
  let calls = 0;
  const transport = createLiveTransport({ fetch: async (url, init) => {
    calls++;
    if (url.endsWith("input")) { expect(JSON.parse(init!.body as string)).toEqual({ input: "disposable-secret" }); throw new Error("lost input acceptance"); }
    return Response.json({ status: "terminal" });
  } });
  const clone = createLiveClone(transport, credentials);
  expect((await clone.sendCloneInput({ jobId: "original", input: "disposable-secret" })).status).toBe("indeterminate");
  expect(await clone.cancelClone("original")).toEqual({ status: "completed", value: { status: "terminal" } });
  expect(calls).toBe(2);
});
