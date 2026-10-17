import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test as base } from "./fixtures";
import { withEngineBrowsers } from "./page-diagnostics";
import { openChatPanel } from "./chat-helpers";
import { captureScreenshot, saveEvidence } from "./evidence";

const test = withEngineBrowsers(base);
function cases() {
test("/btw answers natively without foreground admission or interruption", async ({ page, request }) => {
  await boot(page, request);
  const before = await request.post("/__e2e/chat", { data: { action: "opencode", op: "state" } }).then(response => response.json());
  await page.locator("#chat-input").fill("/btw What does the current task mean?");
  const answer = page.waitForResponse(response => response.url().endsWith("/aside"));
  await page.locator("#chat-send").click();
  expect((await answer).ok()).toBe(true);
  await expect(page.locator("#chat-aside-ready")).toHaveText("Side answer ready");
  await page.locator("#chat-aside-ready").click();
  await expect(page.locator("#chat-aside-answer")).toContainText("native side answer");
  const after = await request.post("/__e2e/chat", { data: { action: "opencode", op: "state" } }).then(response => response.json());
  expect(after.sessions).toEqual(before.sessions);
  expect(after.calls.slice(before.calls.length).filter((call: string) => call.startsWith("POST"))).toEqual([expect.stringMatching(/^POST \/api\/session\/[^/]+\/generate$/)]);
  await page.locator("#chat-aside-close").click();
  await expect(page.locator("#chat-items")).not.toContainText("What does the current task mean?");
  await expect(page.locator("#chat-stop")).toBeEnabled();
});
test("side completion preserves composing focus and concurrent requests never duplicate inference", async ({ page, request }) => {
  await boot(page, request);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/aside", async route => { calls++; await gate; await route.continue(); });
  await page.locator("#chat-input").fill("/btw First side question");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-aside-ready")).toHaveText("Answering /btw…");
  await page.locator("#chat-input").fill("/btw Second side question");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-composer-error")).toContainText("already in progress");
  await page.locator("#chat-input").fill("New foreground draft");
  await page.locator("#chat-input").focus();
  release();
  await expect(page.locator("#chat-aside-ready")).toHaveText("Side answer ready");
  expect(calls).toBe(1);
  await expect(page.locator("#chat-input")).toHaveValue("New foreground draft");
  await expect(page.locator("#chat-input")).toBeFocused();
  await expect(page.locator("#chat-aside-dialog")).not.toBeVisible();
});
test("failed side inference retains the question without changing a newer draft or replaying", async ({ page, request }) => {
  await boot(page, request);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/aside", async route => { calls++; await gate; await route.fulfill({ status: 503, json: { error: "Scripted side failure" } }); });
  await page.locator("#chat-input").fill("/btw Retain this side question");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-aside-ready")).toHaveText("Answering /btw…");
  await page.locator("#chat-input").fill("My exact newer draft");
  release();
  await expect(page.locator("#chat-aside-ready")).toHaveText("Side question failed");
  await expect(page.locator("#chat-input")).toHaveValue("My exact newer draft");
  await page.locator("#chat-aside-ready").click();
  await expect(page.locator("#chat-aside-question")).toHaveText("Retain this side question");
  await expect(page.locator("#chat-aside-answer")).toContainText("No automatic retry");
  expect(calls).toBe(1);
});
async function boot(page: Page, request: APIRequestContext, start = true, native = true) {
  await request.post("/__e2e/reset");
  await request.post("/__e2e/chat", { data: { action: "agents", ...(native ? { stack: "opencode-v2", backgroundPreview: true } : {}) } });
  const { token } = await request.get("/__e2e/terminal-token").then(response => response.json());
  await page.goto(`/?t=${encodeURIComponent(token)}`);
  if (await page.locator("html").getAttribute("data-ui-mode") === "touch") await page.locator("#touch-tab-chat").click();
  else await openChatPanel(page);
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(page.locator("#chat-conversation-select")).not.toHaveValue("");
  if (!start) return;
  await page.locator("#chat-input").fill("Start work");
  const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
  await page.locator("#chat-send").click();
  expect((await accepted).ok()).toBe(true);
  await expect(page.locator("#chat-stop")).toBeEnabled();
}
async function press(page: Page) {
  const box = (await page.locator("#chat-send").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return box;
}
test("unsupported side generation is absent and typed /btw refuses without ordinary admission", async ({ page, request }) => {
  await boot(page, request, false, false);
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/(prompts|aside)$/.test(request.url())) mutations.push(request.url()); });
  await page.locator("#chat-input").fill("/btw Do not send this as a prompt");
  await expect(page.locator('#chat-command-menu [data-command-name="btw"]')).toHaveCount(0);
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-composer-error")).toContainText("not supported");
  await expect(page.locator("#chat-input")).toHaveValue("/btw Do not send this as a prompt");
  expect(mutations).toEqual([]);
});
test("side question refuses and retains a real uploaded attachment", async ({ page, request }) => {
  await boot(page, request);
  const upload = page.waitForResponse(response => response.url().endsWith("/attachments") && response.request().method() === "POST");
  await page.locator("#chat-attach-input").setInputFiles({ name: "side.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=", "base64") });
  expect((await upload).status()).toBe(201);
  await page.locator("#chat-input").fill("/btw Explain the existing context");
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/(prompts|aside)$/.test(request.url())) mutations.push(request.url()); });
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-composer-error")).toContainText("Remove pending images");
  await expect(page.locator("#chat-attachments")).toContainText("side.png");
  await expect(page.locator("#chat-input")).toHaveValue("/btw Explain the existing context");
  expect(mutations).toEqual([]);
});
test("idle hold dispatches normally without inventing a pending queue entry", async ({ page, request }) => {
  await boot(page, request, false);
  await page.locator("#chat-input").fill("Idle held draft");
  const accepted = page.waitForResponse(response => response.url().endsWith("/prompts"));
  await press(page);
  expect(await (await accepted).json()).toMatchObject({ pending: false, delivery: "queue" });
  await page.mouse.up();
  await expect(page.locator(".chat-queued-message")).toHaveCount(0);
  await expect(page.locator("#chat-items")).toContainText("Idle held draft");
});
test("tap steers despite saved Queue keyboard preference; fallback queues without holding", async ({ page, request }) => {
  await boot(page, request);
  await page.locator("#chat-input").fill("Tap is steer");
  await page.locator("#chat-delivery-toggle").click();
  await page.locator('[data-delivery-choice="queue"]').click();
  await page.locator("#chat-send").click();
  await expect(page.locator('.chat-queued-message[data-delivery="steer"]')).toHaveCount(1);
  await page.locator("#chat-input").fill("Accessible queue");
  await page.locator("#chat-delivery-toggle").click();
  await page.locator("#chat-queue-draft").click();
  await expect(page.locator('.chat-queued-message[data-delivery="queue"]')).toHaveCount(1);
});
test("two-second hold queues before release once with fixed target and upward countdown", async ({ page, request }, testInfo) => {
  await boot(page, request);
  await page.locator("#chat-input").fill("Held draft");
  const before = await press(page);
  await expect(page.locator(".chat-hold-upward")).toBeVisible();
  const extension = (await page.locator(".chat-hold-upward").boundingBox())!;
  expect(extension.y).toBeLessThanOrEqual(before.y - 80);
  expect(await page.locator("#chat-send").boundingBox()).toEqual(before);
  await captureScreenshot(page, testInfo, "hold-upward");
  await expect(page.locator('.chat-queued-message[data-delivery="queue"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator("#chat-input")).toHaveValue("");
  await expect(page.locator(".chat-queued-message")).toHaveCount(1);
});
for (const cancellation of ["early release", "drag out", "Escape", "blur", "draft change", "lost capture", "pointercancel", "visibilitychange", "layout change"] as const) {
  test(`${cancellation} cancels a deliberate hold without steering`, async ({ page, request }) => {
    await boot(page, request);
    await page.locator("#chat-input").fill("Keep this draft");
    await page.clock.install();
    const box = await press(page);
    await page.clock.runFor(350); // Deterministic gesture time, not a readiness sleep.
    if (cancellation === "drag out") await page.mouse.move(box.x - 20, box.y);
    if (cancellation === "Escape") await page.keyboard.press("Escape");
    if (cancellation === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (cancellation === "draft change") await page.locator("#chat-input").fill("Edited draft");
    if (cancellation === "lost capture" || cancellation === "pointercancel") await page.locator("#chat-send").dispatchEvent(cancellation === "lost capture" ? "lostpointercapture" : "pointercancel");
    if (cancellation === "visibilitychange") await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    if (cancellation === "layout change") await page.locator("#chat-send").evaluate(node => { node.style.transform = "translateX(-20px)"; });
    await page.mouse.up();
    await page.clock.runFor(2100);
    await expect(page.locator(".chat-queued-message")).toHaveCount(0);
    await expect(page.locator("#chat-input")).toHaveValue(cancellation === "draft change" ? "Edited draft" : "Keep this draft");
  });
}
test("conversation selection invalidates an owned hold and retains its original draft", async ({ page, request }) => {
  await boot(page, request);
  const original = await page.locator("#chat-conversation-select").inputValue();
  await page.locator("#chat-input").fill("Original held draft");
  const before = await request.post("/__e2e/chat", { data: { action: "opencode", op: "state" } }).then(response => response.json());
  await page.clock.install();
  await press(page);
  await page.clock.runFor(350);
  // Programmatic activation changes context without a pointer drag-out first.
  await page.locator("#chat-new-conversation").evaluate((node: HTMLButtonElement) => node.click());
  await expect(page.locator("#chat-conversation-select")).not.toHaveValue(original);
  await page.clock.runFor(2100);
  await page.mouse.up();
  await page.locator("#chat-conversation-select").selectOption(original);
  await expect(page.locator("#chat-input")).toHaveValue("Original held draft");
  await expect(page.locator(".chat-queued-message")).toHaveCount(0);
  const after = await request.post("/__e2e/chat", { data: { action: "opencode", op: "state" } }).then(response => response.json());
  expect(after.calls.slice(before.calls.length).filter((call: string) => call.startsWith("POST") && /\/(prompt|interrupt|background)$/.test(call))).toEqual([]);
});
test("touch inline controls retain real labels and minimum targets", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("uatu:presentation:v1:%2F:uatu:ui-mode", "touch"));
  await boot(page, request);
  const metrics = await page.evaluate(() => Object.fromEntries(["chat-attach", "chat-configuration-trigger", "chat-send", "chat-delivery-toggle", "chat-stop"].map(id => {
    const box = document.getElementById(id)!.getBoundingClientRect();
    return [id, { width: box.width, height: box.height, right: box.right }];
  })));
  for (const box of Object.values(metrics)) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.right).toBeLessThanOrEqual(390); }
  await expect(page.locator("#chat-inline-configuration")).toContainText("Build · Fake Model");
  await captureScreenshot(page, testInfo, "inline-composer");
  await page.locator("#chat-configuration-trigger").click();
  await expect(page.locator("#chat-configuration-dialog")).toBeVisible();
  await saveEvidence(testInfo, "inline-controls.json", JSON.stringify(metrics, null, 2));
  await captureScreenshot(page, testInfo, "inline-model-chooser");
  await page.locator("#chat-configuration-done").click();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.locator("#chat-input").fill("Hold without losing this draft");
    const button = await press(page);
    await page.waitForTimeout(500); // Capture the intentional quarter-hold.
    await page.evaluate(box => {
      const finger = document.createElement("div"); finger.id = "simulated-finger";
      Object.assign(finger.style, { position: "fixed", pointerEvents: "none", zIndex: "9999", left: `${box.x + box.width / 2 - 29}px`, top: `${box.y + box.height / 2 - 29}px`, width: "58px", height: "58px", borderRadius: "50%", background: "#c6947f80", border: "1px solid #be826a99" });
      document.body.append(finger);
    }, button);
    await captureScreenshot(page, testInfo, `inline-hold-finger-${theme}`);
    await page.keyboard.press("Escape"); await page.mouse.up();
    await page.evaluate(() => document.getElementById("simulated-finger")?.remove());
    await expect(page.locator("#chat-input")).toHaveValue("Hold without losing this draft");
  }
});
test("inline context uses the latest occupancy, not output or cumulative session tokens", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("uatu:presentation:v1:%2F:uatu:ui-mode", "touch"));
  await boot(page, request, false, false);
  const conversationId = await page.locator("#chat-conversation-select").inputValue();
  const model = { providerId: "openai", modelId: "gpt-5" };
  for (const item of [
    { type: "context_report", id: "context", createdAt: 1, total: 11000, max: 100000, model },
    { type: "assistant_message", id: "earlier-usage", createdAt: 2, markdown: "Earlier call", model, usage: { input: 80000, output: 300000 } },
    { type: "assistant_message", id: "latest-usage", createdAt: 3, markdown: "Latest call", model, usage: { input: 20000, cacheRead: 5000, output: 900000 } },
  ]) expect((await request.post("/__e2e/chat", { data: { action: "item", conversationId, item } })).ok()).toBe(true);
  await expect(page.locator("#chat-inline-context")).toHaveText("25% · 25k/100k context");
  await expect(page.locator("#chat-inline-context")).toHaveAttribute("title", "25,000 tokens in context; 100,000 reported limit");
});
}
for (const engine of ["chromium", "webkit"] as const) test.describe(`B composer ${engine}`, () => {
  test.use({ page: async ({ launchBrowser, baseURL }, use) => {
    const browser = await launchBrowser(engine);
    const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 720 } });
    await use(page);
    await browser.close();
  } });
  cases();
});
