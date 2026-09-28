// Pushes wait while the user is looking at Uatu (quiet-notifications-while-
// present). A real hub observes its children's notification feeds and
// records every push it would send; presence comes from the session pages'
// own live streams, so a visible page quiets the push and hiding it — the
// page's real visibility path, which releases its stream — lets a question
// still waiting follow the user out. The grace period is shortened to 1.5 s
// (hub-server.ts, UATU_E2E_HUB_PRESENCE_GRACE_MS).
//
// No step waits for time to pass. Each waits for what the hub decided, read
// from its notification journal (a delivery held, sent, or discarded), or
// for the push a question gets once the user reads as away. A claim that
// nothing was pushed is checked only after such a positive event.

import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { Page } from "@playwright/test";
import { childChatControl, expect, openSessionTab, test as hubTest, type HubE2EInfo, type HubE2EWorkspace } from "./hub-fixtures";

type Push = { endpoint: string; payload: { kind: string; url: string } };
type Delivery = { key: string; deviceId: string; status: "pending" | "accepted" | "discarded"; heldAt?: number };
type Device = { id: string; endpoint: string };

// Each test enrolls a device of its own and removes it after. The hub, its
// journal, and its push log live for the worker, while every test's fresh
// children count conversations from 1 again: a device per test keeps one
// test's deliveries and pushes apart from another's.
const test = hubTest.extend<{ device: Device }>({
  device: async ({ hub, hubContext }, use) => {
    const endpoint = `https://web.push.apple.com/e2e-device-${randomUUID()}`;
    const key = createECDH("prime256v1");
    key.generateKeys();
    const response = await hubContext.request.put(`${hub.origin}/api/hub/notifications`, {
      headers: { origin: hub.origin },
      data: {
        subscription: { endpoint, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } },
        allWorkspaces: true, workspaceIds: [], needsAnswer: true, completed: true,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const device = { id: ((await response.json()) as { device: { id: string } }).device.id, endpoint };
    await use(device);
    await hubContext.request.delete(`${hub.origin}/api/hub/notifications?device=${encodeURIComponent(device.id)}`, { headers: { origin: hub.origin } });
  },
});

test.use({ hubWorkspaces: ["alpha", "beta"], hubPush: true });

async function pushes(hub: HubE2EInfo, device: Device, conversationId: string): Promise<Push[]> {
  const text = await fs.readFile(hub.pushLog!, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).map(line => JSON.parse(line) as Push)
    .filter(push => push.endpoint === device.endpoint
      && new URL(push.payload.url, hub.origin).searchParams.get("conversation") === conversationId);
}

// The journal's deliveries to this device for one conversation. A settled
// delivery drops its notification, but its key keeps the identity:
// [workspace, device, notification id], where the id is
// [agent, [conversation, kind, source]] (src/chat/notifications.ts) and the
// conversation id is agent-qualified.
async function deliveries(hub: HubE2EInfo, device: Device, conversationId: string): Promise<Delivery[]> {
  const text = await fs.readFile(hub.notificationStore!, "utf8").catch(() => "");
  if (!text) return [];
  const data = JSON.parse(text) as { deliveries: Delivery[] };
  return data.deliveries.filter(delivery => {
    if (delivery.deviceId !== device.id) return false;
    const [, , notificationId] = JSON.parse(delivery.key) as [string, string, string];
    const [agentId, identity] = JSON.parse(notificationId) as [string, string];
    const [conversation] = JSON.parse(identity) as [string];
    return `${agentId}:${conversation}` === conversationId;
  });
}

// The one delivery's decision, as a string an expect.poll can wait on.
async function decision(hub: HubE2EInfo, device: Device, conversationId: string): Promise<string> {
  const found = await deliveries(hub, device, conversationId);
  if (found.length !== 1) return `${found.length} deliveries`;
  const [delivery] = found;
  return delivery!.status === "pending" && delivery!.heldAt !== undefined ? "held" : delivery!.status;
}

function workspace(hub: HubE2EInfo, id: string): HubE2EWorkspace {
  return hub.workspaces.find(entry => entry.id === id)!;
}

async function ask(hub: HubE2EInfo, title: string, itemId: string): Promise<{ conversationId: string; answer: () => Promise<unknown> }> {
  const beta = workspace(hub, "beta");
  const seeded = (await childChatControl(beta, { action: "seed", title, items: [] })) as { conversation: { id: string } };
  const item = { id: itemId, type: "permission", createdAt: 10, requestId: itemId, action: "bash", resources: ["make release"], status: "pending" };
  await childChatControl(beta, { action: "item", conversationId: seeded.conversation.id, item });
  return {
    conversationId: seeded.conversation.id,
    answer: () => childChatControl(beta, { action: "item", conversationId: seeded.conversation.id, item: { ...item, status: "resolved", outcome: "approved-once" } }),
  };
}

// The page's real hide path: the lifecycle recovery sees `visibilitychange`
// with the document hidden and releases the page's live stream.
async function setVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate(value => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

// Resolves once the user reads as away. A question is held while a session
// page is visible or the grace period since the last one runs, and is pushed
// the moment presence turns away, so its push is that moment. Used at a
// test's start (a previous test's page closed with its context, and the hub
// counts its first grace period from boot) and after hiding a page, where it
// proves the grace period has ended and a delivery pass has run since.
async function awaitAway(hub: HubE2EInfo, device: Device): Promise<void> {
  const sentinel = await ask(hub, "Away sentinel", "permission:away-sentinel");
  try {
    await expect.poll(() => pushes(hub, device, sentinel.conversationId), { timeout: 10_000, message: "user reads as away" }).toHaveLength(1);
  } finally { await sentinel.answer(); }
}

test("a question while a session page is visible is held, then pushed once the page is hidden", async ({ hub, hubContext, device }) => {
  await awaitAway(hub, device);
  const page = await openSessionTab(hubContext, workspace(hub, "alpha"));
  const question = await ask(hub, "Held while looking", "permission:held");
  try {
    await expect.poll(() => decision(hub, device, question.conversationId)).toBe("held");
    expect(await pushes(hub, device, question.conversationId)).toEqual([]);
    await setVisibility(page, "hidden");
    await expect.poll(() => pushes(hub, device, question.conversationId), { timeout: 10_000 }).toHaveLength(1);
    expect((await pushes(hub, device, question.conversationId))[0]!.payload.kind).toBe("permission-pending");
    // Sent and settled: no later delivery pass can send it again.
    await expect.poll(() => decision(hub, device, question.conversationId)).toBe("accepted");
    expect(await pushes(hub, device, question.conversationId)).toHaveLength(1);
  } finally { await question.answer(); }
});

test("a question answered before the page is hidden is never pushed", async ({ hub, hubContext, device }) => {
  await awaitAway(hub, device);
  const page = await openSessionTab(hubContext, workspace(hub, "alpha"));
  const question = await ask(hub, "Answered while looking", "permission:answered");
  await expect.poll(() => decision(hub, device, question.conversationId)).toBe("held");
  await question.answer();
  await expect.poll(() => decision(hub, device, question.conversationId)).toBe("discarded");
  await setVisibility(page, "hidden");
  await awaitAway(hub, device);
  expect(await pushes(hub, device, question.conversationId)).toEqual([]);
});

test("a turn that finishes while a session page is visible is not pushed", async ({ hub, hubContext, device }) => {
  await awaitAway(hub, device);
  const page = await openSessionTab(hubContext, workspace(hub, "alpha"));
  const beta = workspace(hub, "beta");
  const seeded = (await childChatControl(beta, { action: "seed", title: "Finishing while looking", items: [] })) as { conversation: { id: string } };
  await childChatControl(beta, { action: "status", conversationId: seeded.conversation.id, status: "running" });
  await childChatControl(beta, { action: "status", conversationId: seeded.conversation.id, status: "completed" });
  await expect.poll(() => decision(hub, device, seeded.conversation.id)).toBe("discarded");
  await setVisibility(page, "hidden");
  await awaitAway(hub, device);
  expect(await pushes(hub, device, seeded.conversation.id)).toEqual([]);
});

test("with no session page open, a question and a finished turn are pushed without waiting", async ({ hub, device }) => {
  await awaitAway(hub, device);
  const question = await ask(hub, "Nobody looking", "permission:away");
  try {
    await expect.poll(() => pushes(hub, device, question.conversationId), { timeout: 5_000 }).toHaveLength(1);
  } finally { await question.answer(); }
  const beta = workspace(hub, "beta");
  const seeded = (await childChatControl(beta, { action: "seed", title: "Finishing unwatched", items: [] })) as { conversation: { id: string } };
  await childChatControl(beta, { action: "status", conversationId: seeded.conversation.id, status: "running" });
  await childChatControl(beta, { action: "status", conversationId: seeded.conversation.id, status: "completed" });
  await expect.poll(() => pushes(hub, device, seeded.conversation.id), { timeout: 5_000 }).toHaveLength(1);
  expect((await pushes(hub, device, seeded.conversation.id))[0]!.payload.kind).toBe("turn-completed");
});
