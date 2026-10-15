import type { APIRequestContext, Page } from "@playwright/test";

import { openChatPanel } from "./chat-helpers";
import { captureScreenshot } from "./evidence";
import { expect, test } from "./fixtures";

// Steering on OpenCode 2.x (opencode-v2-steering), end to end over the real
// ChatAdapter and OpenCodeV2Provider and the scripted fake OpenCode 2.0.28
// server (tests/e2e/opencode-v2-fake.ts). A turn advances only when the test
// says so: `step` is a step boundary, `finish` ends the turn.

type FakeState = { sessions: Record<string, { running: boolean; pending: Array<{ id: string; delivery: string; payload: { text: string } }> }>; unhandled: string[] };

async function control(request: APIRequestContext, body: Record<string, unknown>): Promise<unknown> {
  const response = await request.post("/__e2e/chat", { data: body });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function bootChat(page: Page, request: APIRequestContext): Promise<void> {
  await request.post("/__e2e/reset");
  await control(request, { action: "agents", stack: "opencode-v2" });
  const token = await request.get("/__e2e/terminal-token").then(response => response.json()) as { token: string };
  await page.goto(`/?t=${encodeURIComponent(token.token)}`);
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await openChatPanel(page);
  await expect(page.locator("#chat-state")).not.toContainText("Loading chat");
}

async function fakeSession(request: APIRequestContext, conversationId: string): Promise<FakeState["sessions"][string] | undefined> {
  const state = await control(request, { action: "opencode", op: "state" }) as FakeState;
  return state.sessions[conversationId.replace(/^opencode:/, "")];
}

async function newConversation(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.locator("#chat-state")).toContainText("Started new conversation with OpenCode");
  await expect(page.locator("#chat-conversation-select")).not.toHaveValue("");
  return page.locator("#chat-conversation-select").inputValue();
}

// Submit with a key and wait for the acceptance; the answer says how the
// workspace took it.
async function submit(page: Page, text: string, key: "Enter" | "Alt+Enter" = "Enter"): Promise<{ pending: boolean; delivery: string }> {
  const input = page.locator("#chat-input");
  await input.fill(text);
  // Enter accepts an autocomplete match before it submits the command.
  if (text.startsWith("/")) {
    await expect(page.locator("#chat-command-menu")).toBeVisible();
    await input.press("Enter");
  }
  const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
  await input.press(key);
  const response = await accepted;
  expect(response.ok()).toBe(true);
  await expect(input).toHaveValue("");
  return response.json();
}

// A running turn with one prompt in it.
async function startTurn(page: Page, request: APIRequestContext): Promise<string> {
  const conversationId = await newConversation(page);
  expect(await submit(page, "Start the work")).toMatchObject({ pending: false });
  await expect(page.locator("#chat-items")).toContainText("Start the work");
  await expect(page.locator("#chat-send")).toHaveAttribute("aria-label", "Cancel response");
  await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(true);
  return conversationId;
}

const dock = (page: Page) => page.locator("#chat-queue .chat-queued-message");
const steers = (page: Page) => page.locator("#chat-queue .chat-queued-message[data-delivery='steer']");
const held = (page: Page) => page.locator("#chat-queue .chat-queued-message[data-delivery='queue']");

test.describe("steering an OpenCode 2.x turn", () => {
  test.beforeEach(async ({ page, request }) => bootChat(page, request));

  test("Enter steers by default: the steer waits in the dock and joins the timeline only at the step boundary", async ({ page, request }, testInfo) => {
    const conversationId = await startTurn(page, request);
    await expect(page.locator("#chat-delivery-toggle")).toBeVisible();
    expect(await submit(page, "Use the other approach")).toMatchObject({ pending: true, delivery: "steer" });
    const steer = steers(page).filter({ hasText: "Use the other approach" });
    await expect(steer).toHaveCount(1);
    await expect(steer.locator(".chat-queued-tag")).toContainText(/^Steer/);
    await expect(page.locator("#chat-queue-note")).toContainText("model and mode");
    await expect(page.locator("#chat-items")).not.toContainText("Use the other approach");
    await expect.poll(async () => (await fakeSession(request, conversationId))?.pending.map(entry => entry.delivery)).toEqual(["steer"]);
    await captureScreenshot(page, testInfo, "steering-pending-steer");

    await control(request, { action: "opencode", op: "step", conversationId });
    await expect(page.locator("#chat-items")).toContainText("Use the other approach");
    await expect(steer).toHaveCount(0);
    await expect(page.locator("#chat-queue-note")).toBeHidden();
    await control(request, { action: "opencode", op: "finish", conversationId, text: "Steered answer" });
    await expect(page.locator("#chat-items")).toContainText("Steered answer");
    const order = await page.locator("#chat-items").innerText();
    expect(order.indexOf("Start the work")).toBeLessThan(order.indexOf("Use the other approach"));
    expect(order.indexOf("Use the other approach")).toBeLessThan(order.indexOf("Steered answer"));
  });

  test("Option+Enter uses the other delivery: the message is held, labelled Queue, and never reaches the inbox", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "Afterwards, write tests", "Alt+Enter")).toMatchObject({ pending: true, delivery: "queue" });
    const entry = held(page).filter({ hasText: "Afterwards, write tests" });
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveClass(/is-held/);
    await expect(entry.locator(".chat-queued-tag")).toContainText(/^Queue/);
    await expect(page.locator("#chat-queue-note")).toBeHidden();
    expect((await fakeSession(request, conversationId))?.pending).toEqual([]);
    // Released when the turn ends: it starts its own turn.
    await control(request, { action: "opencode", op: "finish", conversationId, text: "First answer" });
    await expect(page.locator("#chat-items")).toContainText("Afterwards, write tests");
    await expect(dock(page)).toHaveCount(0);
  });

  test("a queued message switches to steer and a steer back to queue, keeping its place", async ({ page, request }, testInfo) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "Held first", "Alt+Enter")).toMatchObject({ delivery: "queue" });
    expect(await submit(page, "Steer me")).toMatchObject({ delivery: "steer" });
    expect(await submit(page, "Held later", "Alt+Enter")).toMatchObject({ delivery: "queue" });
    // Steers list first.
    await expect(dock(page)).toHaveText([/Steer me/, /Held first/, /Held later/]);
    await captureScreenshot(page, testInfo, "steering-dock-mixed");

    // Queued → steer: the message leaves the workspace's queue for the inbox.
    const switched = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "PATCH");
    await held(page).filter({ hasText: "Held later" }).locator("[data-queue-steer]").click();
    expect((await switched).status()).toBe(200);
    await expect(steers(page)).toHaveText([/Steer me/, /Held later/]);
    await expect.poll(async () => (await fakeSession(request, conversationId))?.pending.map(entry => entry.payload.text)).toEqual(["Steer me", "Held later"]);

    // Steer → queue: withdrawn from the inbox once OpenCode confirms, and
    // held again at its submission-order position, before "Held later".
    const back = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "PATCH");
    await steers(page).filter({ hasText: "Steer me" }).locator("[data-queue-queue]").click();
    expect((await back).status()).toBe(200);
    await expect(dock(page)).toHaveText([/Held later/, /Held first/, /Steer me/]);
    await expect(held(page).filter({ hasText: "Steer me" })).toHaveCount(1);
    await expect.poll(async () => (await fakeSession(request, conversationId))?.pending.map(entry => entry.payload.text)).toEqual(["Held later"]);
  });

  test("a steer can be removed, or edited back into the composer, once OpenCode confirms the withdrawal", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "Remove me")).toMatchObject({ delivery: "steer" });
    expect(await submit(page, "Edit me instead")).toMatchObject({ delivery: "steer" });
    await expect(steers(page)).toHaveCount(2);

    const removal = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "DELETE");
    await steers(page).filter({ hasText: "Remove me" }).locator("[data-queue-remove]").click();
    expect((await removal).status()).toBe(200);
    await expect(steers(page)).toHaveCount(1);
    await expect(page.locator("#chat-items")).not.toContainText("Remove me");

    const withdrawal = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "DELETE");
    await steers(page).filter({ hasText: "Edit me instead" }).locator("[data-queue-edit]").click();
    expect((await withdrawal).status()).toBe(200);
    await expect(steers(page)).toHaveCount(0);
    await expect(page.locator("#chat-input")).toHaveValue("Edit me instead");
    expect((await fakeSession(request, conversationId))?.pending).toEqual([]);
    await control(request, { action: "opencode", op: "finish", conversationId, text: "Done" });
    await expect(page.locator("#chat-items")).not.toContainText("Remove me");
    await expect(page.locator("#chat-items")).not.toContainText("Edit me instead");
  });

  for (const action of ["queue", "edit", "remove"] as const) {
    test(`a steer delivered before ${action} shows the too-late notice, preserves the draft, and appears once`, async ({ page, request }, testInfo) => {
      const conversationId = await startTurn(page, request);
      expect(await submit(page, "Too late to change")).toMatchObject({ delivery: "steer" });
      const steer = steers(page).filter({ hasText: "Too late to change" });
      await expect(steer).toHaveCount(1);
      const inboxId = await steer.getAttribute("data-chat-queued-id");
      await page.locator("#chat-input").fill("My private draft");
      // OpenCode delivers the entry as the cancel arrives, and confirms no cancel.
      await control(request, { action: "opencode", op: "raceDeliverOnCancel", inboxId });
      const attempt = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === (action === "queue" ? "PATCH" : "DELETE"));
      await steer.locator(`[data-queue-${action}]`).click();
      expect((await attempt).status()).toBe(409);
      await expect(page.locator("#chat-composer-error")).toBeVisible();
      await expect(page.locator("#chat-composer-error")).toContainText("Too late — already delivered");
      await expect(dock(page)).toHaveCount(0);
      await expect(page.locator("#chat-input")).toHaveValue("My private draft");
      await expect(page.locator("#chat-items").getByText("Too late to change", { exact: true })).toHaveCount(1);
      await captureScreenshot(page, testInfo, `steering-too-late-${action}`);
      await control(request, { action: "opencode", op: "finish", conversationId, text: "Done" });
      await expect(page.locator("#chat-items").getByText("Too late to change", { exact: true })).toHaveCount(1);
      expect((await control(request, { action: "opencode", op: "state" }) as FakeState).unhandled).toEqual([]);
    });
  }

  test("cancel leaves steers with OpenCode, paused; Send now wakes them together", async ({ page, request }, testInfo) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "First steer")).toMatchObject({ delivery: "steer" });
    expect(await submit(page, "Second steer")).toMatchObject({ delivery: "steer" });
    expect(await submit(page, "Held behind", "Alt+Enter")).toMatchObject({ delivery: "queue" });
    await expect(dock(page)).toHaveCount(3);

    const cancel = page.waitForResponse(response => response.url().endsWith("/cancel"));
    await page.locator("#chat-send").click();
    expect((await cancel).status()).toBe(200);
    await expect(page.locator("#chat-composer-status")).toHaveAttribute("aria-label", "Cancelled");
    await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(false);
    // Nothing was delivered, and every entry reads paused.
    expect((await fakeSession(request, conversationId))?.pending.map(entry => entry.payload.text)).toEqual(["First steer", "Second steer"]);
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(3);
    await expect(steers(page).first().locator(".chat-queued-tag")).toContainText(/paused/);
    const wake = steers(page).first().locator("[data-queue-send-now]");
    await expect(wake).toHaveText("Send now (all paused steers)");
    await captureScreenshot(page, testInfo, "steering-paused-after-cancel");

    const sent = page.waitForResponse(response => response.url().endsWith("/send-now"));
    await wake.click();
    expect((await sent).status()).toBe(200);
    // OpenCode resumed and delivered both steers, oldest first; the held
    // message stays, dormant.
    await expect(page.locator("#chat-items")).toContainText("First steer");
    await expect(page.locator("#chat-items")).toContainText("Second steer");
    await expect(steers(page)).toHaveCount(0);
    await expect(held(page)).toHaveCount(1);
    const order = await page.locator("#chat-items").innerText();
    expect(order.indexOf("First steer")).toBeLessThan(order.indexOf("Second steer"));
    await control(request, { action: "opencode", op: "finish", conversationId, text: "Resumed answer" });
    await expect(page.locator("#chat-items")).toContainText("Resumed answer");
    await expect(held(page)).toHaveCount(1);
  });

  test("a new steer resumes paused steers", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "Stranded")).toMatchObject({ delivery: "steer" });
    await page.locator("#chat-send").click();
    await expect(page.locator("#chat-composer-status")).toHaveAttribute("aria-label", "Cancelled");
    await expect(steers(page).filter({ hasText: "Stranded" })).toHaveAttribute("data-paused", "");
    expect(await submit(page, "And this")).toMatchObject({ delivery: "steer" });
    await expect(page.locator("#chat-items")).toContainText("Stranded");
    await expect(page.locator("#chat-items")).toContainText("And this");
    await expect(steers(page)).toHaveCount(0);
    await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(true);
  });

  test("Undo names pending steers and the replacement delivers them oldest first ahead of the held queue", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    await submit(page, "Keep this steer");
    await submit(page, "Keep this held", "Alt+Enter");
    await page.locator("#chat-input").fill("/undo");
    await expect(page.locator("#chat-command-menu")).toBeVisible();
    const undone = page.waitForResponse(response => response.url().endsWith("/undo"));
    // The explicit submit shortcut bypasses autocomplete, including a catalog
    // refresh that can reopen its menu after Escape.
    await page.locator("#chat-input").press("Control+Enter");
    expect((await undone).status()).toBe(200);
    await expect(page.locator("#chat-composer-status-live")).toContainText("Keep this steer");
    await expect(page.locator("#chat-composer-status-live")).toContainText("delivered together with your replacement");
    await expect(page.locator("#chat-input")).toHaveValue("Start the work");
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(2);

    expect(await submit(page, "Replacement work")).toMatchObject({ delivery: "steer" });
    await expect(steers(page)).toHaveCount(0);
    await expect(held(page)).toHaveText([/Keep this held/]);
    await expect(page.locator("#chat-items")).toContainText("Replacement work");
    const order = await page.locator("#chat-items").innerText();
    expect(order.indexOf("Keep this steer")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("Keep this steer")).toBeLessThan(order.indexOf("Replacement work"));
    await control(request, { action: "opencode", op: "finish", conversationId });
    await expect(page.locator("#chat-items")).toContainText("Answer 1");
    await expect(page.locator("#chat-items")).toContainText("Keep this held");
    await expect(held(page)).toHaveCount(0);
  });

  test("a command always queues, whatever the delivery, and offers no steer", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "/reload")).toMatchObject({ pending: true, delivery: "queue" });
    const command = held(page).filter({ hasText: "/reload" });
    await expect(command).toHaveCount(1);
    await expect(command.locator("[data-queue-steer]")).toHaveCount(0);
    await expect(command.locator("[data-queue-send-now]")).toHaveCount(0);
    await expect(command.locator("[data-queue-remove]")).toHaveCount(1);
    expect((await fakeSession(request, conversationId))?.pending).toEqual([]);
    await command.locator("[data-queue-remove]").click();
    await expect(dock(page)).toHaveCount(0);
  });

  test("a reload shows the same dock: steers first, then the queue, with their paused state", async ({ page, request }) => {
    await startTurn(page, request);
    expect(await submit(page, "Steer one")).toMatchObject({ delivery: "steer" });
    expect(await submit(page, "Held one", "Alt+Enter")).toMatchObject({ delivery: "queue" });
    await page.locator("#chat-send").click();
    await expect(page.locator("#chat-composer-status")).toHaveAttribute("aria-label", "Cancelled");
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(2);

    await page.reload();
    await openChatPanel(page);
    await expect(dock(page)).toHaveText([/Steer one/, /Held one/]);
    await expect(dock(page).nth(0)).toHaveAttribute("data-delivery", "steer");
    await expect(dock(page).nth(1)).toHaveAttribute("data-delivery", "queue");
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(2);
    await expect(page.locator("#chat-queue-note")).toBeVisible();
  });
});

test.describe("the delivery menu on touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("offers Steer and Queue by name inside the Send control, sets the default, and keeps the rail's layout", async ({ page, request }, testInfo) => {
    await request.post("/__e2e/reset");
    await control(request, { action: "agents", stack: "opencode-v2" });
    const token = await request.get("/__e2e/terminal-token").then(response => response.json()) as { token: string };
    await page.goto(`/?t=${encodeURIComponent(token.token)}`);
    await expect(page.locator("html")).toHaveAttribute("data-ui-mode", "touch");
    await page.locator("#touch-tab-chat").click();
    await expect(page.locator("#chat-surface")).toBeVisible();
    const conversationId = await newConversation(page);
    const input = page.locator("#chat-input");
    await input.fill("Start the work");
    const started = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await page.locator("#chat-send").tap();
    expect(await (await started).json()).toMatchObject({ pending: false });
    await expect(page.locator("#chat-send")).toHaveAttribute("aria-label", "Cancel response");
    await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(true);

    const rail = page.locator(".chat-composer-actions");
    const before = await rail.boundingBox();
    const sendBefore = await page.locator("#chat-send").boundingBox();
    const toggle = page.locator("#chat-delivery-toggle");
    await expect(toggle).toBeVisible();
    await toggle.tap();
    const menu = page.locator("#chat-delivery-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator("[data-delivery-choice]")).toHaveText([/Steer/, /Queue/]);
    await expect(menu.locator("[data-delivery-choice='steer']")).toHaveAttribute("aria-checked", "true");
    await captureScreenshot(page, testInfo, "steering-touch-menu");
    const after = await rail.boundingBox();
    const sendAfter = await page.locator("#chat-send").boundingBox();
    expect(after!.height).toBeCloseTo(before!.height, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(sendAfter!.x).toBeCloseTo(sendBefore!.x, 0);
    expect(sendAfter!.width).toBeCloseTo(sendBefore!.width, 0);
    await toggle.tap();
    await expect(menu).toBeHidden();

    // Choosing Queue with a draft sends it as a queue and makes queue the
    // device default: the next Enter queues too.
    await input.fill("Later, please");
    await toggle.tap();
    const queued = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await menu.locator("[data-delivery-choice='queue']").tap();
    expect(await (await queued).json()).toMatchObject({ pending: true, delivery: "queue" });
    await expect(menu).toBeHidden();
    await expect(held(page).filter({ hasText: "Later, please" })).toHaveCount(1);
    await input.fill("Also later");
    const again = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await input.press("Enter");
    expect(await (await again).json()).toMatchObject({ pending: true, delivery: "queue" });
    await toggle.tap();
    await expect(menu.locator("[data-delivery-choice='queue']")).toHaveAttribute("aria-checked", "true");
  });
});
