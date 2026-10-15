import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { appUrl, resetAppBasePathForTests } from "../../shared/app-url";
import type { BoundedFetchTimers, Fetcher } from "../../shell/bounded-fetch";
import { createLiveHubReads, type LiveReadResult } from "./live-reads";
import type { MobileHubBackend, ReadResult } from "./backend";

const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const oldLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
beforeEach(() => {
  const { document } = parseHTML('<html><head><meta name="uatu-hub" content="true"><meta name="uatu-base-path" content="/s/a/"></head><body></body></html>');
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://hub.invalid/s/a/guide.md") });
  resetAppBasePathForTests();
});
afterEach(() => {
  for (const [name, descriptor] of [["document", oldDocument], ["location", oldLocation]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  resetAppBasePathForTests();
});

const state = { version: "test", hubApiRevision: 1, workspaceApiRevision: 1, workspaces: [] };
const defaults = { configured: null, configuredAvailable: false, effective: "/test-home" };
const cases = [
  { method: "readHubState", path: "/api/hub/state", body: state, value: state },
  { method: "readCredentials", path: "/api/hub/credentials", body: { credentials: [] }, value: [] },
  { method: "readDefaultFolder", path: "/api/hub/settings/workspace-defaults", body: defaults, value: defaults },
] as const;

function clock() {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const timers: BoundedFetchTimers = {
    setTimeout(callback) { const id = ++nextId; callbacks.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimeout(id) { callbacks.delete(id as unknown as number); },
  };
  return { timers, count: () => callbacks.size, expire() { for (const callback of [...callbacks.values()]) callback(); } };
}

function typeContracts(reads: ReturnType<typeof createLiveHubReads>, result: LiveReadResult<string>) {
  const compatible: ReadResult<string> = result;
  // @ts-expect-error this is not a complete mobile backend with fabricated methods
  const backend: MobileHubBackend = reads;
  // @ts-expect-error read transport cannot start workspaces
  reads.startWorkspace({ workspaceId: "a" });
  void [compatible, backend];
}
void typeContracts;

describe("live Hub read transport", () => {
  test("has only three reads, does nothing at construction and keeps Hub scope during a workspace detour", async () => {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const reads = createLiveHubReads({ fetch: async (input, init) => {
      calls.push({ input, init: init! });
      const route = cases.find(item => item.path === input);
      if (!route) throw new Error("Unexpected route");
      return Response.json(route.body);
    } });
    expect(calls).toEqual([]);
    expect(Object.keys(reads).sort()).toEqual(cases.map(item => item.method).sort());
    for (const pathname of ["/s/a/guide.md", "/settings"]) {
      location.pathname = pathname;
      for (const item of cases) expect<unknown>(await reads[item.method]()).toEqual({ status: "available", value: item.value });
      expect(appUrl("/api/state")).toBe("/s/a/api/state");
    }
    expect(calls.map(call => call.input)).toEqual([...cases, ...cases].map(item => item.path));
    for (const { init } of calls) {
      expect(init).toMatchObject({ method: "GET", credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", headers: { accept: "application/json" } });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init).not.toHaveProperty("body");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    }
  });

  test("refuses a Hub-shaped standalone page without probing any endpoint", async () => {
    document.querySelector('meta[name="uatu-hub"]')!.remove();
    let count = 0;
    const reads = createLiveHubReads({ fetch: async () => { count++; return Response.json(state); } });
    for (const item of cases) expect(await reads[item.method]()).toMatchObject({ status: "unavailable", reason: "outside-hub", problem: { kind: "unavailable" } });
    expect(count).toBe(0);
  });

  for (const item of cases) {
    test(`${item.method}: HTTP failures keep auth distinct and never retry/echo bodies`, async () => {
      for (const status of [401, 403, 404, 429, 500, 503]) {
        let count = 0;
        const time = clock();
        const reads = createLiveHubReads({ timers: time.timers, fetch: async () => {
          count++; return new Response("private-test-sentinel", { status });
        } });
        const result = await reads[item.method]();
        expect(result).toMatchObject({ status: "unavailable", reason: "http", httpStatus: status, problem: { kind: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not-found" : "unavailable" } });
        expect(JSON.stringify(result)).not.toContain("private-test-sentinel");
        expect(result).not.toHaveProperty("value");
        expect(count).toBe(1);
        expect(time.count()).toBe(0);
      }
    });

    test(`${item.method}: malformed/non-JSON/redirected responses are not successful reads`, async () => {
      const redirected = Response.json(item.body);
      Object.defineProperty(redirected, "redirected", { value: true });
      for (const response of [Response.json({ bad: "private-test-sentinel" }), new Response("{bad", { headers: { "content-type": "application/json" } }), new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), redirected]) {
        let count = 0;
        const result = await createLiveHubReads({ fetch: async () => { count++; return response; } })[item.method]();
        expect(result).toMatchObject({ status: "unavailable", reason: "malformed", problem: { kind: "unavailable" } });
        expect(JSON.stringify(result)).not.toContain("private-test-sentinel");
        expect(count).toBe(1);
      }
    });

    test(`${item.method}: network rejection including synchronous fetch failure settles and releases timer`, async () => {
      for (const sync of [true, false]) {
        const time = clock();
        let count = 0;
        const fetcher: Fetcher = () => { count++; if (sync) throw new Error("private-test-sentinel"); return Promise.reject(new Error("private-test-sentinel")); };
        const result = await createLiveHubReads({ fetch: fetcher, timers: time.timers })[item.method]();
        expect(result).toMatchObject({ status: "unavailable", reason: "network", problem: { kind: "unavailable" } });
        expect(JSON.stringify(result)).not.toContain("private-test-sentinel");
        expect(count).toBe(1);
        expect(time.count()).toBe(0);
      }
    });

    test(`${item.method}: bounds headers and body, aborts, and ignores late success without retry`, async () => {
      for (const stalledBody of [false, true]) {
        const time = clock();
        let signal: AbortSignal | undefined;
        let count = 0;
        let respond!: (response: Response) => void;
        let body!: ReadableStreamDefaultController<Uint8Array>;
        const reads = createLiveHubReads({ timers: time.timers, fetch: async (_input, init) => {
          signal = init?.signal ?? undefined; count++;
          if (stalledBody) return new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }), { headers: { "content-type": "application/json" } });
          return new Promise(resolve => { respond = resolve; });
        } });
        const pending = reads[item.method]();
        // Let headers enter consumption in the body-stalled case, without sleeping.
        for (let i = 0; i < 8; i++) await Promise.resolve();
        time.expire();
        const result = await pending;
        expect(result).toMatchObject({ status: "unavailable", reason: "timeout", problem: { kind: "unavailable" } });
        expect(signal?.aborted).toBe(true);
        if (stalledBody) { body.enqueue(new TextEncoder().encode(JSON.stringify(item.body))); body.close(); }
        else respond(Response.json(item.body));
        for (let i = 0; i < 8; i++) await Promise.resolve();
        expect(await pending).toBe(result);
        expect(count).toBe(1);
        expect(time.count()).toBe(0);
      }
    });

    test(`${item.method}: interrupted response body is network failure, not invalid data or sign-out`, async () => {
      const time = clock();
      const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("private-test-sentinel")); } }), { headers: { "content-type": "application/json" } });
      const result = await createLiveHubReads({ fetch: async () => response, timers: time.timers })[item.method]();
      expect(result).toMatchObject({ status: "unavailable", reason: "network", problem: { kind: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("private-test-sentinel");
      expect(time.count()).toBe(0);
    });
  }

  test("accepts parameterized JSON and cleans up the successful read's timeout", async () => {
    const time = clock();
    const reads = createLiveHubReads({ timers: time.timers, fetch: async () => new Response(JSON.stringify(state), { headers: { "content-type": "Application/JSON; charset=utf-8" } }) });
    expect(await reads.readHubState()).toEqual({ status: "available", value: state });
    expect(time.count()).toBe(0);
    time.expire();
  });

  test("rejects invalid timeout configuration before any request", () => {
    for (const timeoutMs of [0, -1, NaN, Infinity, 0.5, 2_147_483_648]) expect(() => createLiveHubReads({ timeoutMs })).toThrow(RangeError);
  });

  test("builds an isolated browser graph with no frontend mount or privileged/test runtime", async () => {
    const result = await Bun.build({ entrypoints: [new URL("./live-reads.ts", import.meta.url).pathname], target: "browser", sourcemap: "external" });
    expect(result.success).toBe(true);
    const sources: string[] = [];
    for (const output of result.outputs) {
      if (output.path.endsWith(".map")) sources.push(...JSON.parse(await output.text()).sources);
      else {
        const script = await output.text();
        for (const marker of ["Bun.spawn", "Bun.serve", "node:", "__mobileHubReview", "createSyntheticBackend", "mountMobileHub", "mountMobileCoordinator"]) expect(script).not.toContain(marker);
      }
    }
    // appUrl's base-path code is tree-shaken: only hubUrl is used here.
    const allowed = ["hub/mobile/live-reads.ts", "hub/mobile/live-read-model.ts", "hub/credential-types.ts", "shared/app-url.ts", "shell/bounded-fetch.ts"];
    expect(sources).toHaveLength(allowed.length);
    for (const source of sources) expect(allowed.some(path => source.endsWith(path))).toBe(true);
  });
});
