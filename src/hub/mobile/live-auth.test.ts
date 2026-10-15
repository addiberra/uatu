import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { resetAppBasePathForTests } from "../../shared/app-url";
import { createLiveAuthentication, decodeDevices } from "./live-auth";
import { createLiveTransport } from "./live-transport";
import type { Invalidation } from "./backend";

const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeEach(() => {
  const { document } = parseHTML('<html><head><meta name="uatu-hub" content="true"><meta name="uatu-base-path" content="/s/a/"></head></html>');
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  resetAppBasePathForTests();
});
afterEach(() => {
  if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document");
  resetAppBasePathForTests();
});
const state = { version: "test", hubApiRevision: 13, workspaceApiRevision: 24, workspaces: [], identity: { user: "test-user", host: "test-host" } };
const device = { handle: "abcdefghijklmnop", deviceLabel: "Test browser", current: true, issuedAt: 1 };

test("cookie-only login verifies identity without retaining bearer credentials or accepting a redirect", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const auth = createLiveAuthentication(createLiveTransport({ fetch: async (path, init) => {
    calls.push({ path, init: init! });
    return Response.json(path === "/login" ? { user: "test-user" } : state);
  } }));
  expect(await auth.signIn({ user: "test-user", password: "disposable", deviceLabel: "Test browser" })).toEqual({ status: "completed", value: { ...state.identity, version: "test" } });
  expect(calls.map(call => call.path)).toEqual(["/login", "/api/hub/state"]);
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ name: "test-user", password: "disposable", deviceLabel: "Test browser", sessionTransport: "cookie" });
  for (const call of calls) {
    expect(call.init).toMatchObject({ credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store" });
    expect(new Headers(call.init.headers).has("authorization")).toBe(false);
  }
});

test("old server identity is unknown and a native login response is never accepted", async () => {
  for (const payload of [{ ...state, identity: undefined }, { sessionId: "never-store-me", user: "test-user" }]) {
    const auth = createLiveAuthentication(createLiveTransport({ fetch: async () => Response.json(payload) }));
    const result = "sessionId" in payload ? await auth.signIn({ user: "test-user", password: "disposable" }) : await auth.readAuthentication();
    expect(result.status).not.toBe("completed");
    expect(result.status).not.toBe("available");
    expect(JSON.stringify(result)).not.toContain("never-store-me");
  }
});

test("invalid and rate-limited login are sanitized, do not retry or invalidate unrelated roots", async () => {
  for (const [status, kind] of [[401, "unauthorized"], [403, "forbidden"], [429, "rate-limited"]] as const) {
    let count = 0;
    const transport = createLiveTransport({ fetch: async () => { count++; return Response.json({ error: "private-error" }, { status }); } });
    const events: Invalidation[] = [];
    transport.subscribeInvalidation(event => events.push(event));
    const result = await createLiveAuthentication(transport).signIn({ user: "test-user", password: "disposable" });
    expect(result).toMatchObject({ status: "rejected", problem: { kind } });
    expect(JSON.stringify(result)).not.toContain("private-error");
    expect(events).toEqual([]);
    expect(count).toBe(1);
  }
});

test("device handles never expose raw session fields and malformed/duplicate records are refused", () => {
  expect(decodeDevices({ sessions: [{ ...device, sessionId: "private" }] })).toEqual([{ ...device, issuedAt: 1000 }]);
  for (const sessions of [[{ ...device, handle: "raw-session-credential-too-long" }], [device, device], [{ ...device, issuedAt: NaN }], []]) {
    expect(() => decodeDevices({ sessions })).toThrow();
  }
});

test("current revoke and logout invalidate, other revoke does not; handles cannot inject routes", async () => {
  for (const action of ["current", "other", "logout"] as const) {
    const transport = createLiveTransport({ fetch: async () => Response.json({ revoked: true, current: action === "current" }) });
    const events: Invalidation[] = [];
    transport.subscribeInvalidation(event => events.push(event));
    const auth = createLiveAuthentication(transport);
    expect((await (action === "logout" ? auth.signOut() : auth.revokeDevice(device.handle))).status).toBe("completed");
    expect(events.length).toBe(action === "other" ? 0 : 1);
    expect(await auth.revokeDevice("../other/revoke")).toMatchObject({ status: "rejected", problem: { kind: "invalid-input" } });
  }
});

test("authoritative 401 fences a delayed body before it can restore authenticated state", async () => {
  let release!: (value: Response) => void;
  let count = 0;
  const transport = createLiveTransport({ fetch: async () => ++count === 1 ? new Promise(resolve => { release = resolve; }) : Response.json({}, { status: 401 }) });
  const auth = createLiveAuthentication(transport);
  const stale = auth.readAuthentication();
  expect(await auth.readAuthentication()).toEqual({ status: "available", value: { status: "signed-out" } });
  release(Response.json(state));
  expect((await stale).status).toBe("unavailable");
});

test("network loss, malformed success and 5xx never become definite mutation rejection or auto-retry", async () => {
  for (const response of [() => { throw new Error("private"); }, () => Response.json({}, { status: 500 }), () => Response.json({ revoked: false })]) {
    let count = 0;
    const transport = createLiveTransport({ fetch: async () => { count++; return response(); } });
    const events: Invalidation[] = [];
    transport.subscribeInvalidation(event => events.push(event));
    expect(await createLiveAuthentication(transport).signOut()).toMatchObject({ status: "indeterminate" });
    expect(count).toBe(1);
    expect(events).toEqual([]);
  }
});

test("session change fences previous reads and refuses overlapping login/logout", async () => {
  let release!: (response: Response) => void;
  const transport = createLiveTransport({ fetch: async () => new Promise(resolve => { release = resolve; }) });
  const auth = createLiveAuthentication(transport);
  const logout = auth.signOut();
  expect(await auth.signIn({ user: "test-user", password: "disposable" })).toMatchObject({ status: "rejected", problem: { kind: "conflict" } });
  release(Response.json({ revoked: true }));
  expect((await logout).status).toBe("completed");
});

test("a timed-out read cannot invalidate a newer session when its late 401 arrives", async () => {
  let release!: (response: Response) => void;
  const transport = createLiveTransport({ timeoutMs: 5, fetch: async () => new Promise(resolve => { release = resolve; }) });
  const events: Invalidation[] = [];
  transport.subscribeInvalidation(event => events.push(event));
  expect((await createLiveAuthentication(transport).readAuthentication()).status).toBe("unavailable");
  release(Response.json({}, { status: 401 }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(events).toEqual([]);
});
