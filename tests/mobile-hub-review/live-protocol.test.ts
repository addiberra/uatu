import { expect, test } from "bun:test";
import { LIVE_HELLO_EVENT, LIVE_ENVELOPE_EVENT } from "../../src/shared/live-protocol";
import { SseFrameParser, type SseFrame } from "../../src/hub/live-sse";
import { startReviewServer } from "./server";
import { conversationId } from "./protocols";

test("reviewer multiplexes document and chat, controls subscriptions, and invalidates old streams", async () => {
  const review = await startReviewServer({ port: 0, assets: new Map() });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 4000);
  try {
    const subs = [{ topic: "document", key: "compareTarget=base&scope=folder" }];
    const response = await fetch(`${review.url}/api/hub/live?${new URLSearchParams({ ws: "atlas", subs: JSON.stringify(subs) })}`, { signal: abort.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader(), parser = new SseFrameParser();
    const frames: SseFrame[] = [];
    const until = async (predicate: (frame: SseFrame) => boolean) => {
      while (true) {
        const frame = frames.find(predicate);
        if (frame) return JSON.parse(frame.data);
        const chunk = await reader.read().catch(error => { throw new Error(`Expected live frame absent; received ${JSON.stringify(frames)}`, { cause: error }); });
        if (chunk.done) throw new Error("Synthetic live stream ended before expected frame");
        frames.push(...parser.push(chunk.value).filter((frame): frame is SseFrame => !("comment" in frame)));
      }
    };
    const hello = await until(frame => frame.event === LIVE_HELLO_EVENT);
    const state = await until(frame => frame.event === LIVE_ENVELOPE_EVENT && frame.data.includes('"kind":"snapshot"'));
    expect(state.event.data.discovery.status).toBe("ready");
    const endpoint = `${review.url}/api/hub/live/${hello.streamId}/subscriptions`;
    const changed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ add: [{ topic: "conversation", key: conversationId, cursor: "review-1:0" }] }) });
    expect(changed.status).toBe(200);
    review.protocols.emitChat();
    await until(frame => frame.event === LIVE_ENVELOPE_EVENT && frame.data.includes('"type":"item.upsert"'));
    await review.synthetic.backend.signOut();
    expect((await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: '{}' })).status).toBe(401);
    expect((await fetch(`${review.url}/api/hub/live?ws=unknown`)).status).toBe(401);
  } finally { clearTimeout(timeout); abort.abort(); review.stop(); }
});
