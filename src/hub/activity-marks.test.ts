import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ActivityMarkStore } from "./activity-marks";
import { LiveBroker, setLiveUpstreamDiagnostics, type LiveSessionChange, type LiveUpstreamSource } from "./live-broker";
import type { LiveEnvelope } from "../shared/live-protocol";

const temporaryDirectories: string[] = [];
const brokers: LiveBroker[] = [];

afterEach(async () => {
  for (const created of brokers.splice(0)) created.dispose();
  setLiveUpstreamDiagnostics(null);
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function stateDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uatu-activity-marks-"));
  temporaryDirectories.push(directory);
  return directory;
}

// A child stand-in for one workspace: an SSE response the test pushes
// activity frames into, exactly as the broker's own watch would read them.
function fakeSource(options: { registered?: string[]; running?: boolean } = {}) {
  const registered = options.registered ?? ["a"];
  const encoder = new TextEncoder();
  const listeners = new Set<(change: LiveSessionChange) => void>();
  let running = options.running ?? true;
  let push: (frame: string) => void = () => {};
  const source: LiveUpstreamSource = {
    isRunning: () => running,
    workspaceIds: () => [...registered],
    async open({ path: requested, signal }) {
      if (requested !== "/api/activity") throw new Error(`unexpected upstream ${requested}`);
      if (!running) throw new Error("not running");
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          push = frame => {
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              // Already ended.
            }
          };
          push(": open\n\n");
          signal.addEventListener("abort", () => {
            try {
              controller.close();
            } catch {
              // Already ended.
            }
          }, { once: true });
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    activity: (working: boolean, awaiting: boolean) => push(`event: activity\ndata: {"working":${working},"awaiting":${awaiting}}\n\n`),
    setRunning(value: boolean) {
      running = value;
      for (const listener of listeners) listener({ workspaceId: "a", running: value });
    },
  };
}

function feed(live: LiveBroker, user: string) {
  const envelopes: LiveEnvelope[] = [];
  const attachment = live.subscribeActivity({ write: envelope => { envelopes.push(envelope); } }, user);
  return {
    attachment,
    latest: () => {
      const last = envelopes.filter(envelope => envelope.ws === "a").at(-1);
      return (last?.event as { data: { running: boolean; working: boolean; awaiting: boolean; finished: boolean } } | undefined)?.data;
    },
  };
}

async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(5);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// One hub lifetime over a state file: a store loaded from disk, a broker
// adopting its marks, and a child whose activity the broker watches.
async function hub(file: string, options: { registered?: string[] } = {}) {
  setLiveUpstreamDiagnostics(() => undefined);
  const store = new ActivityMarkStore(file, 5);
  await store.load();
  const child = fakeSource({ registered: options.registered });
  const live = new LiveBroker(child.source, { lingerMs: 20, retryMinMs: 20, retryMaxMs: 40, marks: store });
  brokers.push(live);
  return {
    store,
    child,
    live,
    async shutdown() {
      await store.flush();
      live.dispose();
      store.close();
    },
  };
}

describe("ActivityMarkStore", () => {
  test("writes the marks and reads them back", async () => {
    const file = path.join(await stateDir(), "activity-marks.json");
    const store = new ActivityMarkStore(file, 5);
    await store.load();
    store.write({ finishedAt: new Map([["a", 4]]), viewedAt: new Map([["bob", new Map([["a", 7]])]]) });
    await store.flush();

    const reloaded = new ActivityMarkStore(file, 5);
    await reloaded.load();
    const marks = reloaded.read();
    expect([...marks.finishedAt]).toEqual([["a", 4]]);
    expect([...marks.viewedAt.get("bob")!]).toEqual([["a", 7]]);
    // Never the live reading: `observed` has no place on disk.
    expect(Object.keys(JSON.parse(await Bun.file(file).text())).sort()).toEqual(["finished", "version", "viewed"]);
  });

  test("a missing, malformed, or unreadable file starts empty rather than refusing to serve", async () => {
    const directory = await stateDir();
    const missing = new ActivityMarkStore(path.join(directory, "absent.json"), 5);
    await missing.load();
    expect(missing.read().finishedAt.size).toBe(0);

    const malformedPath = path.join(directory, "malformed.json");
    await writeFile(malformedPath, "{\"version\": 1, \"finished\": {\"a\": ", "utf8");
    const malformed = new ActivityMarkStore(malformedPath, 5);
    await malformed.load();
    expect(malformed.read().finishedAt.size).toBe(0);

    const strangePath = path.join(directory, "strange.json");
    await writeFile(strangePath, JSON.stringify({ version: 1, finished: { a: "soon", b: 3 }, viewed: 7 }), "utf8");
    const strange = new ActivityMarkStore(strangePath, 5);
    await strange.load();
    expect([...strange.read().finishedAt]).toEqual([["b", 3]]);
    expect(strange.read().viewedAt.size).toBe(0);

    // Unreadable: a directory where the file should be.
    const blockedPath = path.join(directory, "blocked.json");
    await mkdir(blockedPath);
    const blocked = new ActivityMarkStore(blockedPath, 5);
    await blocked.load();
    expect(blocked.read().finishedAt.size).toBe(0);
  });

  test("a write that cannot land degrades to memory-only", async () => {
    const file = path.join(await stateDir(), "absent-directory", "activity-marks.json");
    const store = new ActivityMarkStore(file, 5);
    await store.load();
    store.write({ finishedAt: new Map([["a", 2]]), viewedAt: new Map() });
    const reported: unknown[] = [];
    const previous = console.error;
    console.error = (...args: unknown[]) => { reported.push(args); };
    try {
      await store.flush();
    } finally {
      console.error = previous;
    }
    expect(reported).toHaveLength(1);
    expect([...store.read().finishedAt]).toEqual([["a", 2]]);
  });
});

describe("marks across a hub restart (fix-workspace-activity-states D12)", () => {
  test("a finish survives the restart; a user who viewed it before still does not see it", async () => {
    const file = path.join(await stateDir(), "activity-marks.json");
    const first = await hub(file);
    const alice = feed(first.live, "alice");
    const bob = feed(first.live, "bob");
    await waitFor(() => alice.latest() !== undefined, "feeds primed");
    first.child.activity(true, false);
    await waitFor(() => alice.latest()!.working, "working");
    first.child.activity(false, false);
    await waitFor(() => alice.latest()!.finished && bob.latest()!.finished, "both finished");
    first.live.acknowledgeViewed("bob", "a");
    expect(bob.latest()!.finished).toBe(false);
    await first.shutdown();

    const second = await hub(file);
    const aliceAgain = feed(second.live, "alice");
    const bobAgain = feed(second.live, "bob");
    expect(aliceAgain.latest()!.finished).toBe(true);
    expect(bobAgain.latest()!.finished).toBe(false);
    // The live reading did not survive, so the first frame after the restart
    // has no predecessor and invents no second finish for bob.
    second.child.activity(false, false);
    await Bun.sleep(30);
    expect(bobAgain.latest()!.finished).toBe(false);
    await second.shutdown();
  });

  test("the stamp counter resumes above the reloaded marks, so a view after the restart clears a finish from before it", async () => {
    const file = path.join(await stateDir(), "activity-marks.json");
    const first = await hub(file);
    const alice = feed(first.live, "alice");
    await waitFor(() => alice.latest() !== undefined, "feed primed");
    first.child.activity(true, false);
    await waitFor(() => alice.latest()!.working, "working");
    first.child.activity(false, false);
    await waitFor(() => alice.latest()!.finished, "finished");
    await first.shutdown();
    const finishedStamp = (JSON.parse(await Bun.file(file).text()) as { finished: Record<string, number> }).finished.a!;

    const second = await hub(file);
    const aliceAgain = feed(second.live, "alice");
    expect(aliceAgain.latest()!.finished).toBe(true);
    second.live.acknowledgeViewed("alice", "a");
    expect(aliceAgain.latest()!.finished).toBe(false);
    await second.shutdown();
    const persisted = JSON.parse(await Bun.file(file).text()) as { viewed: Record<string, Record<string, number>> };
    expect(persisted.viewed.alice!.a!).toBeGreaterThan(finishedStamp);
  });

  test("marks for a workspace the registry no longer names are dropped at load", async () => {
    const file = path.join(await stateDir(), "activity-marks.json");
    const first = await hub(file);
    const alice = feed(first.live, "alice");
    await waitFor(() => alice.latest() !== undefined, "feed primed");
    first.child.activity(true, false);
    await waitFor(() => alice.latest()!.working, "working");
    first.child.activity(false, false);
    await waitFor(() => alice.latest()!.finished, "finished");
    first.live.acknowledgeViewed("bob", "a");
    await first.shutdown();

    // The workspace was forgotten while the hub was down.
    const second = await hub(file, { registered: [] });
    feed(second.live, "alice");
    await second.shutdown();
    const reloaded = new ActivityMarkStore(file, 5);
    await reloaded.load();
    expect(reloaded.read().finishedAt.size).toBe(0);
    expect(reloaded.read().viewedAt.size).toBe(0);
  });
});
