import type { APIRequestContext, Page } from "@playwright/test";

import { openChatPanel } from "./chat-helpers";
import { captureScreenshot, saveEvidence } from "./evidence";
import { expect, test as base } from "./fixtures";
import { withEngineBrowsers } from "./page-diagnostics";

const test = withEngineBrowsers(base);

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
  if (await page.locator("html").getAttribute("data-ui-mode") === "touch") await page.locator("#touch-tab-chat").tap();
  else await openChatPanel(page);
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
  await input.press(key === "Enter" && await page.locator("html").getAttribute("data-ui-mode") === "touch" ? "Control+Enter" : key);
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
  await expect(page.locator("#chat-stop")).toBeEnabled();
  await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(true);
  return conversationId;
}

const dock = (page: Page) => page.locator("#chat-queue .chat-queued-message");
const steers = (page: Page) => page.locator("#chat-queue .chat-queued-message[data-delivery='steer']");
const held = (page: Page) => page.locator("#chat-queue .chat-queued-message[data-delivery='queue']");

test.describe("steering an OpenCode 2.x turn", () => {
  test.beforeEach(async ({ page, request }) => bootChat(page, request));

  test("duplicate text and image-only dock actions stay uniquely named after removal", async ({ page, request }, testInfo) => {
    await startTurn(page, request);
    await submit(page, "Identical pending", "Alt+Enter");
    await submit(page, "Identical pending", "Alt+Enter");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=", "base64");
    for (let index = 0; index < 2; index++) {
      const uploaded = page.waitForResponse(response => response.url().endsWith("/attachments") && response.request().method() === "POST");
      await page.locator("#chat-attach-input").setInputFiles({ name: "same-image.png", mimeType: "image/png", buffer: png });
      expect((await uploaded).status()).toBe(201);
      const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
      await page.locator("#chat-send").click();
      expect((await accepted).ok()).toBe(true);
    }
    await expect(dock(page)).toHaveCount(4);
    const removes = page.locator("#chat-queue [data-queue-remove]");
    const labels = await removes.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
    expect(new Set(labels).size).toBe(4);
    for (const label of labels) expect(label).toMatch(/, pending message \d+$/);
    const survivor = held(page).nth(1).locator("[data-queue-remove]");
    const survivorLabel = await survivor.getAttribute("aria-label");
    const removed = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "DELETE");
    await held(page).first().locator("[data-queue-remove]").click();
    expect((await removed).ok()).toBe(true);
    await expect(held(page)).toHaveCount(1);
    await expect(held(page).locator("[data-queue-remove]")).toHaveAttribute("aria-label", survivorLabel!);
    await saveEvidence(testInfo, "review-unique-pending-actions.json", JSON.stringify({ labelsBeforeRemoval: labels, retainedLabel: survivorLabel }, null, 2));
    await captureScreenshot(page, testInfo, "review-unique-pending-actions");
  });

  test("each successful removal announces once without replay on routine worker updates", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    await submit(page, "Remove first", "Alt+Enter");
    await submit(page, "Remove second", "Alt+Enter");
    await expect(held(page)).toHaveCount(2);
    await page.evaluate(() => {
      const live = document.querySelector("#chat-composer-status-live")!;
      const messages: string[] = [];
      (window as unknown as { removalAnnouncements: string[] }).removalAnnouncements = messages;
      new MutationObserver(() => { if (live.textContent === "Pending message removed") messages.push(live.textContent); }).observe(live, { childList: true, subtree: true, characterData: true });
    });
    for (const text of ["Remove first", "Remove second"]) {
      const removed = page.waitForResponse(response => response.url().includes("/queue/") && response.request().method() === "DELETE");
      await held(page).filter({ hasText: text }).locator("[data-queue-remove]").click();
      expect((await removed).ok()).toBe(true);
    }
    await expect(held(page)).toHaveCount(0);
    const announcements = () => page.evaluate(() => (window as unknown as { removalAnnouncements: string[] }).removalAnnouncements);
    await expect.poll(announcements).toEqual(["Pending message removed", "Pending message removed"]);
    await control(request, { action: "opencode", op: "launchWorker", conversationId });
    await expect(page.locator("#chat-subagents")).toContainText("Inspect safe fixture");
    expect(await announcements()).toEqual(["Pending message removed", "Pending message removed"]);
  });

  for (const mode of ["desktop", "touch"] as const) for (const theme of ["light", "dark"] as const) test(`audited dock targets, sticky counts and overflow on ${mode} ${theme}`, async ({ page, request }, testInfo) => {
    await startTurn(page, request);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: mode === "touch" ? 390 : 1600, height: 1000 });
    await page.evaluate(({ mode, theme }) => {
      document.documentElement.dataset.uiMode = mode;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.activeTab = "chat";
    }, { mode, theme });
    for (let index = 1; index <= 5; index++) await submit(page, `Audit pending ${index}: preserve this longer message for a readable dock`, index > 2 ? "Alt+Enter" : "Enter");
    if (mode === "touch") await page.locator("[data-pending-toggle]").click();
    const queue = page.locator("#chat-queue");
    await queue.evaluate(element => { element.scrollTop = 0; });
    await expect(queue.locator(".chat-queue-header")).toContainText("5 pending · 2 steers · 3 queued");
    await expect(queue).toHaveClass(/has-more-below/);
    const metrics = await queue.evaluate(element => ({ height: element.clientHeight, viewport: innerHeight }));
    expect(metrics.height).toBeGreaterThan(135);
    expect(metrics.height).toBeLessThanOrEqual(metrics.viewport * 0.4 + 1);
    await saveEvidence(testInfo, `audit-dock-${mode}-${theme}-metrics.json`, JSON.stringify(await queue.evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      header: element.querySelector(".chat-queue-header")?.textContent,
      actions: Array.from(element.querySelectorAll<HTMLButtonElement>(".chat-queued-message button")).map(button => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent, label: button.getAttribute("aria-label"), width: rect.width, height: rect.height };
      }),
    })), null, 2));
    for (const button of await queue.locator(".chat-queued-message button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(mode === "touch" ? 44 : 36);
      expect(box.width).toBeGreaterThanOrEqual(mode === "touch" ? 44 : 36);
      expect(await button.getAttribute("aria-label")).toContain("“Audit pending");
    }
    await captureScreenshot(page, testInfo, `audit-dock-${mode}-${theme}`);
    await page.locator("#chat-delivery-toggle").click();
    await expect(page.locator("#chat-delivery-menu")).toBeVisible();
    await captureScreenshot(page, testInfo, `audit-composer-${mode}-${theme}`);
    await page.keyboard.press("Escape");
    await queue.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(queue).not.toHaveClass(/has-more-below/);
    await expect(queue.locator(".chat-queue-header")).toBeInViewport();
  });

  for (const key of ["Enter", "Alt+Enter"] as const) {
    test(`cancellation blocks ${key} without losing the draft or leaking a delivery override`, async ({ page, request }) => {
      await startTurn(page, request);
      // Retain a paused steer after Stop so the next submission still has a
      // delivery choice, making a leaked Alt override observable on the wire.
      await submit(page, "Pending before cancellation");
      let releaseCancel!: () => void;
      let enteredCancel!: () => void;
      const gate = new Promise<void>(resolve => { releaseCancel = resolve; });
      const entered = new Promise<void>(resolve => { enteredCancel = resolve; });
      await page.route("**/cancel", async route => {
        enteredCancel();
        await gate;
        await route.continue();
      });
      const prompts: unknown[] = [];
      page.on("request", request => {
        if (request.url().endsWith("/prompts")) prompts.push(request.postDataJSON());
      });
      const input = page.locator("#chat-input");
      await input.fill("Keep this draft until cancellation settles");
      const cancelled = page.waitForResponse(response => response.url().endsWith("/cancel"));
      try {
        await page.locator("#chat-stop").click();
        await entered;
        await expect(page.locator("#chat-send")).toBeDisabled();
        await input.press(key);
        await expect(input).toHaveValue("Keep this draft until cancellation settles");
        expect(prompts).toEqual([]);
      } finally {
        releaseCancel();
      }
      expect((await cancelled).ok()).toBe(true);
      await expect(page.locator("#chat-send")).toBeEnabled();
      await expect(page.locator("#chat-stop")).toBeDisabled();
      const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
      await input.press("Enter");
      expect(await (await accepted).json()).toMatchObject({ pending: true, delivery: "steer" });
      expect(prompts).toEqual([expect.objectContaining({ text: "Keep this draft until cancellation settles", delivery: "steer" })]);
      await expect(input).toHaveValue("");
    });
  }

  test("composer explains current shortcuts and selected delivery with readable Send contrast", async ({ page, request }, testInfo) => {
    await newConversation(page);
    await expect(page.locator("#chat-delivery-toggle")).toBeDisabled();
    await expect(page.locator("#chat-delivery-toggle")).toHaveAttribute("title", /idle messages send immediately/);
    await submit(page, "Start the work");
    await expect(page.locator("#chat-stop")).toBeEnabled();
    await page.locator("#chat-input").fill("Keep preference draft");
    await page.locator("#chat-delivery-toggle").click();
    const queue = page.getByRole("menuitemradio", { name: /^Queue/ });
    await queue.click();
    await expect(page.locator("#chat-delivery-toggle")).toHaveAttribute("title", "Send and Enter: Queue");
    await expect(page.locator("#chat-send")).toHaveAttribute("aria-label", "Send to queue");
    await page.locator("#chat-delivery-toggle").focus();
    await page.locator("#chat-delivery-toggle").press("Enter");
    await expect(queue).toHaveAttribute("aria-checked", "true");
    await expect(queue).toContainText("Enter");
    await expect(page.getByRole("menuitemradio", { name: /^Steer/ })).toContainText("Alt+Enter");
    expect(await queue.evaluate(element => getComputedStyle(element.querySelector(".chat-delivery-name")!, "::before").content)).toContain("✓");
    await page.keyboard.press("Escape");
    await expect(page.locator("#chat-delivery-toggle")).toBeFocused();
    await page.emulateMedia({ colorScheme: "dark" });
    const contrast = await page.locator("#chat-send").evaluate(element => {
      const colors = getComputedStyle(element);
      const luminance = (color: string) => {
        const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      };
      return (luminance(colors.color) + 0.05) / (luminance(colors.backgroundColor) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await saveEvidence(testInfo, "audit-enabled-send-dark-contrast.json", JSON.stringify({ contrast }, null, 2));
    await captureScreenshot(page, testInfo, "audit-composer-enabled-dark");
  });

  test("visible Send uses the selected delivery while only Stop cancels", async ({ page, request }, testInfo) => {
    const conversationId = await newConversation(page);
    const send = page.locator("#chat-send");
    const stop = page.getByRole("button", { name: "Stop response", exact: true });
    await expect(stop).toBeDisabled();
    await submit(page, "Start the work");
    await expect(stop).toBeEnabled();
    await expect(send).toBeVisible();
    await expect(send).toBeDisabled();
    const input = page.locator("#chat-input");
    const mutations: string[] = [];
    page.on("request", request => {
      if (/\/(prompts|cancel)$/.test(request.url())) mutations.push(request.url());
    });
    await input.fill("Later, please");
    await page.locator("#chat-delivery-toggle").click();
    await page.getByRole("menuitemradio", { name: /^Queue/ }).click();
    await expect(input).toHaveValue("Later, please");
    await expect(input).toBeFocused();
    await expect(page.locator("#chat-delivery-toggle")).toContainText("Queue");
    expect(mutations).toEqual([]);
    await captureScreenshot(page, testInfo, "steering-separated-actions-desktop");
    const queued = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await send.click();
    expect(await (await queued).json()).toMatchObject({ pending: true, delivery: "queue" });
    await expect(held(page)).toContainText("Later, please");
    expect((await fakeSession(request, conversationId))?.running).toBe(true);
    expect(mutations.filter(url => url.endsWith("/cancel"))).toEqual([]);
    await input.fill("Keep my unsent draft");
    const cancelled = page.waitForResponse(response => response.url().endsWith("/cancel"));
    await stop.click();
    expect((await cancelled).ok()).toBe(true);
    await expect(stop).toBeDisabled();
    await expect(input).toHaveValue("Keep my unsent draft");
    await expect(send).toBeEnabled();
    await expect(held(page)).toHaveAttribute("data-paused");
  });

  test("delivery choices support menu keys and dismiss when keyboard focus leaves", async ({ page, request }, testInfo) => {
    await startTurn(page, request);
    const toggle = page.locator("#chat-delivery-toggle");
    const menu = page.locator("#chat-delivery-menu");
    const steer = menu.locator("[data-delivery-choice='steer']");
    const queue = menu.locator("[data-delivery-choice='queue']");
    await toggle.focus();
    await toggle.press("Enter");
    await expect(steer).toBeFocused();
    await captureScreenshot(page, testInfo, "steering-keyboard-menu");
    await page.keyboard.press("ArrowDown");
    await expect(queue).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(steer).toBeFocused();
    await page.keyboard.press("End");
    await expect(queue).toBeFocused();
    await page.keyboard.press("Home");
    await expect(steer).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(queue).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.press("Enter");
    await page.keyboard.press("Shift+Tab");
    await expect(menu).toBeHidden();
    await expect(page.locator("#chat-configuration-trigger")).toBeFocused();
    // Choosing a default with no draft is not a submission.
    await toggle.focus();
    await toggle.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(page.locator("#chat-input")).toBeFocused();
    expect(await submit(page, "Keyboard queued")).toMatchObject({ delivery: "queue" });
  });

  test("Enter steers by default: the steer waits in the dock and joins the timeline only at the step boundary", async ({ page, request }, testInfo) => {
    const conversationId = await startTurn(page, request);
    await expect(page.locator("#chat-delivery-toggle")).toBeVisible();
    expect(await submit(page, "Use the other approach")).toMatchObject({ pending: true, delivery: "steer" });
    const steer = steers(page).filter({ hasText: "Use the other approach" });
    await expect(steer).toHaveCount(1);
    await expect(steer.locator(".chat-queued-badge")).toHaveText("Steer");
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
    await expect(entry.locator(".chat-queued-badge")).toHaveText("Queue");
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
      await expect(page.locator("#chat-composer-error")).toHaveClass(/is-notice/);
      await expect(page.locator("#chat-state")).not.toHaveClass(/is-error/);
      await expect(page.locator("#chat-state")).not.toContainText("Too late — already delivered");
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
    await page.locator("#chat-stop").click();
    expect((await cancel).status()).toBe(200);
    await expect(page.locator("#chat-composer-status")).toHaveAttribute("aria-label", "Cancelled");
    await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(false);
    // Nothing was delivered, and every entry reads paused.
    expect((await fakeSession(request, conversationId))?.pending.map(entry => entry.payload.text)).toEqual(["First steer", "Second steer"]);
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(3);
    await expect(steers(page).first().locator(".chat-queued-paused")).toHaveText("Paused");
    const wake = page.locator(".chat-queue-header [data-queue-send-now]");
    await expect(wake).toHaveText("Send 2 paused steers now");
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

  test("queued Send now explains and confirms waking paused steers", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    await submit(page, "Paused first");
    await submit(page, "Send selected queue", "Alt+Enter");
    await submit(page, "Leave held", "Alt+Enter");
    const cancelled = page.waitForResponse(response => response.url().endsWith("/cancel"));
    await page.locator("#chat-stop").click();
    expect((await cancelled).ok()).toBe(true);
    const action = held(page).filter({ hasText: "Send selected queue" }).locator("[data-queue-send-now]");
    await expect(action).toHaveText("Send now + paused steers");
    await action.click();
    const confirmation = page.getByRole("dialog", { name: "Send queued message now?" });
    await expect(confirmation).toContainText("also sends all 1 paused steer");
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dock(page)).toHaveCount(3);
    const sent = page.waitForResponse(response => response.url().endsWith("/send-now"));
    await action.click();
    await confirmation.getByRole("button", { name: "Send now", exact: true }).click();
    expect((await sent).ok()).toBe(true);
    await expect(steers(page)).toHaveCount(0);
    await expect(held(page)).toHaveCount(1);
    await expect(held(page)).toContainText("Leave held");
    await expect(page.locator("#chat-items")).toContainText("Paused first");
    await expect(page.locator("#chat-items")).toContainText("Send selected queue");
    expect((await fakeSession(request, conversationId))?.running).toBe(true);
  });

  test("a new steer resumes paused steers", async ({ page, request }) => {
    const conversationId = await startTurn(page, request);
    expect(await submit(page, "Stranded")).toMatchObject({ delivery: "steer" });
    await page.locator("#chat-stop").click();
    await expect(page.locator("#chat-composer-status")).toHaveAttribute("aria-label", "Cancelled");
    await expect(steers(page).filter({ hasText: "Stranded" })).toHaveAttribute("data-paused", "");
    expect(await submit(page, "And this")).toMatchObject({ delivery: "steer" });
    await expect(page.locator("#chat-items")).toContainText("Stranded");
    await expect(page.locator("#chat-items")).toContainText("And this");
    await expect(steers(page)).toHaveCount(0);
    await expect.poll(async () => (await fakeSession(request, conversationId))?.running).toBe(true);
  });

  test("Undo counts pending steers and the replacement delivers them oldest first ahead of the held queue", async ({ page, request }, testInfo) => {
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
    await expect(page.locator("#chat-composer-status-live")).toContainText("1 pending steer");
    await expect(page.locator("#chat-composer-status-live")).toContainText("delivered together with your replacement");
    await expect(page.locator("#chat-input")).toHaveValue("Start the work");
    await expect(page.locator("#chat-queue .chat-queued-message[data-paused]")).toHaveCount(2);
    await captureScreenshot(page, testInfo, "steering-undo-confirmation");
    await expect(page.locator("#chat-queue-note")).toContainText("1 pending steer");
    await expect(page.locator("#chat-queue-note")).toContainText("delivered together with your replacement");

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

  test("Revert reveals its replacement warning in an already-scrolled dock without stealing subsequent scroll", async ({ page, request }, testInfo) => {
    await startTurn(page, request);
    for (let index = 1; index <= 6; index++) await submit(page, `Pending steer ${index}`);
    const queue = page.locator("#chat-queue");
    const note = page.locator("#chat-queue-note");
    await queue.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await queue.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.locator("#chat-items").getByRole("button", { name: "Revert message", exact: true }).click();
    await expect(note).toContainText("delivered together with your replacement");
    await captureScreenshot(page, testInfo, "steering-scrolled-revert-warning");
    await expect(note).toBeInViewport({ ratio: 1 });
    // Reading lower entries after the reveal is deliberate. A later queue
    // update must not drag the reader back to the still-active warning.
    await queue.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await steers(page).last().getByRole("button", { name: "Remove “Pending steer 6”", exact: true }).click();
    await expect(steers(page)).toHaveCount(5);
    await expect(note).not.toContainText("Pending steer 6");
    expect(await queue.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(note).not.toBeInViewport();
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
    await page.locator("#chat-stop").click();
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

for (const browserName of ["chromium", "webkit"] as const) test.describe(`steering on touch (${browserName})`, () => {
  test.use({ page: async ({ launchBrowser, baseURL }, use) => {
    const browser = await launchBrowser(browserName);
    const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await use(page);
    await browser.close();
  } });

  test("large separated targets keep narrow layouts stable and edge taps never stop work", async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await bootChat(page, request);
    const conversationId = await newConversation(page);
    const controls = ["#chat-delivery-toggle", "#chat-send", "#chat-stop"];
    const boxes = async () => Promise.all(controls.map(async selector => {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      return box!;
    }));
    const idle = await boxes();
    await page.locator("#chat-input").fill("Start narrow work");
    await page.locator("#chat-send").tap();
    await expect(page.locator("#chat-stop")).toBeEnabled();
    expect(await boxes()).toEqual(idle);
    const mutations: string[] = [];
    page.on("request", request => {
      if (/\/(prompts|cancel)$/.test(request.url())) mutations.push(request.url());
    });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 740 });
      await page.locator("#chat-input").fill("Unsent draft");
      const before = await boxes();
      for (const [index, box] of before.entries()) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        if (index > 0) {
          expect(box.x - (before[index - 1]!.x + before[index - 1]!.width)).toBeGreaterThanOrEqual(8);
          expect(box.y).toEqual(before[0]!.y);
        }
      }
      // Both ends of the edge nearest Send, inside the rounded corners,
      // belong only to Delivery, not Stop.
      for (const y of [10, before[0]!.height - 10]) {
        await page.locator("#chat-delivery-toggle").tap({ position: { x: before[0]!.width - 2, y } });
        await expect(page.locator("#chat-delivery-menu")).toBeVisible();
        for (const choice of await page.locator("[data-delivery-choice]").all()) {
          expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await page.locator("[data-delivery-choice='queue']").tap();
        await expect(page.locator("#chat-input")).toHaveValue("Unsent draft");
        await expect(page.locator("#chat-input")).toBeFocused();
      }
      // The empty gap before Stop is not a hidden extension of its hit area.
      await page.touchscreen.tap(before[2]!.x - 4, before[2]!.y + 22);
      expect(await boxes()).toEqual(before);
      expect(mutations).toEqual([]);
      expect((await fakeSession(request, conversationId))?.running).toBe(true);
      expect(await page.locator("#chat-surface").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await captureScreenshot(page, testInfo, `steering-separated-${width}-${browserName}`);
    }
    // Hardware-keyboard navigation on touch retains the same safe semantics.
    await page.locator("#chat-delivery-toggle").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-delivery-choice='queue']")).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(page.locator("#chat-input")).toHaveValue("Unsent draft");
    expect(mutations).toEqual([]);
    const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await page.locator("#chat-send").tap();
    expect(await (await accepted).json()).toMatchObject({ pending: true, delivery: "steer" });
    await expect(page.locator("#chat-stop")).toBeEnabled();
    const stopped = page.waitForResponse(response => response.url().endsWith("/cancel"));
    await page.locator("#chat-stop").tap();
    expect((await stopped).ok()).toBe(true);
    await expect(page.locator("#chat-stop")).toBeDisabled();
    expect(mutations.filter(url => url.endsWith("/cancel"))).toHaveLength(1);
  });

  test("touch dock supports switch, edit, cancel, resume, and a visible Undo warning", async ({ page, request }, testInfo) => {
    await bootChat(page, request);
    const conversationId = await newConversation(page);
    const input = page.locator("#chat-input");
    await input.fill("Start touch work");
    await page.locator("#chat-send").tap();
    await captureScreenshot(page, testInfo, `steering-touch-start-${browserName}`);
    await expect(page.locator("#chat-stop")).toBeEnabled();
    const sendChoice = async (text: string, delivery: "steer" | "queue") => {
      await input.fill(text);
      await page.locator("#chat-delivery-toggle").tap();
      const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
      await page.locator(`#chat-delivery-menu [data-delivery-choice='${delivery}']`).tap();
      await expect(input).toHaveValue(text);
      await page.locator("#chat-send").tap();
      expect(await (await accepted).json()).toMatchObject({ pending: true, delivery });
      await expect(input).toHaveValue("");
    };
    await sendChoice("Touch steer", "steer");
    await page.locator("[data-pending-toggle]").tap();
    await steers(page).locator("[data-queue-queue]").tap();
    await captureScreenshot(page, testInfo, `steering-touch-switch-${browserName}`);
    await expect(held(page)).toHaveText([/Touch steer/]);
    await held(page).locator("[data-queue-steer]").tap();
    await expect(steers(page)).toHaveText([/Touch steer/]);
    await input.fill("Private draft");
    await steers(page).locator("[data-queue-edit]").tap();
    await expect(input).toHaveValue("Touch steer\nPrivate draft");
    await expect(input).toBeFocused();
    await expect(dock(page)).toHaveCount(0);
    await sendChoice("First touch steer", "steer");
    await sendChoice("Second touch steer", "steer");
    await sendChoice("Held touch work", "queue");
    await page.locator("#chat-stop").tap();
    await expect(page.locator("#chat-queue [data-paused]")).toHaveCount(3);
    await captureScreenshot(page, testInfo, `steering-touch-paused-${browserName}`);
    await page.getByRole("button", { name: "Send 2 paused steers now", exact: true }).tap();
    await expect(steers(page)).toHaveCount(0);
    await expect(held(page)).toHaveCount(1);
    await expect(page.locator("#chat-items")).toContainText("Second touch steer");
    await sendChoice("Keep this touch steer", "steer");
    await page.locator("#chat-items").getByRole("button", { name: "Revert message", exact: true }).last().tap();
    await expect(input).toHaveValue("Second touch steer");
    await expect(page.locator("#chat-queue-note")).toContainText("1 pending steer");
    await expect(page.locator("#chat-queue-note")).toContainText("delivered together with your replacement");
    await expect(page.locator("#chat-queue-note")).toBeInViewport();
    await captureScreenshot(page, testInfo, `steering-touch-undo-${browserName}`);
    // No clipped horizontal controls; the dock itself scrolls vertically.
    expect(await page.locator("#chat-surface").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await input.fill("Touch replacement");
    await page.locator("#chat-send").tap();
    await expect(page.locator("#chat-items")).toContainText("Touch replacement");
    await expect(held(page)).toHaveText([/Held touch work/]);
    await control(request, { action: "opencode", op: "finish", conversationId });
    await expect(page.locator("#chat-items")).toContainText("Held touch work");
  });

  test("separate touch delivery selects without sending and keeps the rails stable", async ({ page, request }, testInfo) => {
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
    await expect(page.locator("#chat-stop")).toBeEnabled();
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
    await captureScreenshot(page, testInfo, `steering-touch-menu-${browserName}`);
    const after = await rail.boundingBox();
    const sendAfter = await page.locator("#chat-send").boundingBox();
    expect(after!.height).toBeCloseTo(before!.height, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(sendAfter!.x).toBeCloseTo(sendBefore!.x, 0);
    expect(sendAfter!.width).toBeCloseTo(sendBefore!.width, 0);
    await toggle.tap();
    await expect(menu).toBeHidden();

    // Choosing Queue only sets the default; Send and Enter use it.
    await input.fill("Later, please");
    await toggle.tap();
    await page.keyboard.press("Escape");
    await expect(input).toBeFocused();
    await expect(menu).toBeHidden();
    await toggle.tap();
    const queued = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await menu.locator("[data-delivery-choice='queue']").tap();
    await expect(input).toHaveValue("Later, please");
    await expect(input).toBeFocused();
    await page.locator("#chat-send").tap();
    expect(await (await queued).json()).toMatchObject({ pending: true, delivery: "queue" });
    await expect(menu).toBeHidden();
    await expect(held(page).filter({ hasText: "Later, please" })).toHaveCount(1);
    await input.fill("Also later");
    const again = page.waitForResponse(response => response.url().endsWith("/prompts"));
    await input.press("Control+Enter");
    expect(await (await again).json()).toMatchObject({ pending: true, delivery: "queue" });
    await toggle.tap();
    await expect(menu.locator("[data-delivery-choice='queue']")).toHaveAttribute("aria-checked", "true");
  });
});
