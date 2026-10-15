import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { LiveEnvelope } from "../shared/live-protocol";
import type { SessionBackend } from "./backend";
import { EMPTY_CREDENTIAL_CONTEXT_RESOLVER } from "./credential-context";
import { HubSessionStore, hubCookieName } from "./auth";
import type { HubConfig } from "./config";
import { LiveBroker, setLiveUpstreamDiagnostics, type LiveUpstreamSource } from "./live-broker";
import { PersonalWorkspaceStateStore } from "./personal-state";
import { WorkspaceRegistry } from "./registry";
import { startHubServer } from "./server";
import { SessionManager } from "./sessions";

const tempDirectories: string[] = [];
const servers: ReturnType<typeof startHubServer>[] = [];
const brokers: LiveBroker[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const broker of brokers.splice(0)) broker.dispose();
  setLiveUpstreamDiagnostics(null);
  await Promise.all(tempDirectories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

// The Hub over a broker whose one workspace, `project`, is running and whose
// activity upstream is a controllable SSE response: the route's effect is
// visible only through a user's activity feed, so the feed is what the tests
// read. No child is started or contacted.
async function startFixture() {
  setLiveUpstreamDiagnostics(() => undefined);
  const dir = await mkdtemp(path.join(os.tmpdir(), "uatu-activity-viewed-"));
  tempDirectories.push(dir);
  const registry = new WorkspaceRegistry(path.join(dir, "registry.json"));
  await registry.load();
  await registry.register("/srv/workspaces/project");
  const personalState = new PersonalWorkspaceStateStore(path.join(dir, "personal.json"));
  await personalState.load();
  const sessionStore = new HubSessionStore(path.join(dir, "sessions.json"));
  await sessionStore.load();
  const backend: SessionBackend = {
    start: async (_workspace, _basePath, _credentials) => {
      throw new Error("activity-viewed requests must not start or contact a child");
    },
  };
  const sessions = new SessionManager(registry, { local: backend }, EMPTY_CREDENTIAL_CONTEXT_RESOLVER);

  const encoder = new TextEncoder();
  let push: (frame: string) => void = () => {};
  const source: LiveUpstreamSource = {
    isRunning: id => id === "project",
    workspaceIds: () => ["project"],
    async open({ path: requested }) {
      if (requested !== "/api/activity") throw new Error(`unexpected upstream ${requested}`);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          push = frame => controller.enqueue(encoder.encode(frame));
          push(": open\n\n");
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    },
  };
  const liveBroker = new LiveBroker(source, { lingerMs: 20, retryMinMs: 20, retryMaxMs: 40 });
  brokers.push(liveBroker);

  const config: HubConfig = {
    port: 0,
    host: "127.0.0.1",
    tls: null,
    users: [
      { name: "alice", passwordHash: "unused" },
      { name: "bob", passwordHash: "unused" },
    ],
  };
  const server = startHubServer({ config, registry, sessions, sessionStore, personalState, liveBroker });
  servers.push(server);
  const cookies = new Map<string, string>();
  const cookie = async (user: string): Promise<string> => {
    let value = cookies.get(user);
    if (!value) {
      value = `${hubCookieName(new URL(`http://127.0.0.1:${server.port}`))}=${(await sessionStore.issue(user, "test")).id}`;
      cookies.set(user, value);
    }
    return value;
  };
  const feed = (user: string) => {
    const envelopes: LiveEnvelope[] = [];
    liveBroker.subscribeActivity({ write: envelope => { envelopes.push(envelope); } }, user);
    return {
      envelopes,
      latest: () => (envelopes.at(-1)!.event as { data: { running: boolean; working: boolean; awaiting: boolean; finished: boolean } }).data,
    };
  };
  const waitFor = async (predicate: () => boolean, what: string): Promise<void> => {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await Bun.sleep(5);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  // Drives the child's summary from working to quiet, so every feed reads
  // finished.
  const finishWork = async (feeds: ReturnType<typeof feed>[]) => {
    await waitFor(() => push !== undefined && feeds.every(f => f.envelopes.length > 0), "feeds primed");
    push('event: activity\ndata: {"working":true,"awaiting":false}\n\n');
    await waitFor(() => feeds.every(f => f.latest().working), "working");
    push('event: activity\ndata: {"working":false,"awaiting":false}\n\n');
    await waitFor(() => feeds.every(f => f.latest().finished), "finished");
  };
  return { cookie, feed, waitFor, finishWork, origin: `http://127.0.0.1:${server.port}` };
}

describe("Hub activity-viewed acknowledgement", () => {
  test("answers 204 and clears finished for the acknowledging user only, on every device", async () => {
    const fixture = await startFixture();
    const aliceTab = fixture.feed("alice");
    const aliceOtherTab = fixture.feed("alice");
    const bob = fixture.feed("bob");
    await fixture.finishWork([aliceTab, aliceOtherTab, bob]);

    const url = `${fixture.origin}/s/project/api/activity-viewed`;
    expect((await fetch(url, { method: "POST" })).status).toBe(401);
    const response = await fetch(url, { method: "POST", headers: { cookie: await fixture.cookie("alice"), origin: fixture.origin } });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    await fixture.waitFor(() => !aliceTab.latest().finished && !aliceOtherTab.latest().finished, "alice's feeds cleared");
    expect(aliceTab.latest()).toEqual({ running: true, working: false, awaiting: false, finished: false });
    expect(bob.latest().finished).toBe(true);
    // Idempotent: nothing more is emitted for a second acknowledgement.
    const count = aliceTab.envelopes.length;
    expect((await fetch(url, { method: "POST", headers: { cookie: await fixture.cookie("alice"), origin: fixture.origin } })).status).toBe(204);
    await Bun.sleep(20);
    expect(aliceTab.envelopes).toHaveLength(count);
  });

  test("rejects an unknown workspace, a foreign origin, and other methods", async () => {
    const fixture = await startFixture();
    const cookie = await fixture.cookie("alice");
    const unknown = await fetch(`${fixture.origin}/s/no-such-workspace/api/activity-viewed`, { method: "POST", headers: { cookie, origin: fixture.origin } });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown workspace: no-such-workspace" });

    const url = `${fixture.origin}/s/project/api/activity-viewed`;
    const foreign = await fetch(url, { method: "POST", headers: { cookie, origin: "https://attacker.example" } });
    expect(foreign.status).toBe(403);

    const get = await fetch(url, { headers: { cookie } });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect(await get.json()).toEqual({ error: "method not allowed" });
  });
});
