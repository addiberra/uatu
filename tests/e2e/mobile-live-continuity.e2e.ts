import { test, expect, openEventSources, childChatControl } from "./hub-fixtures";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

test.use({ hubWorkspaces: ["mobile-a", "mobile-b"], hubCredentials: true });

async function navigation(page: Page) {
  await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
  if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
}
async function hub(page: Page) {
  await navigation(page); await page.locator("#navigation-hub").click();
  await expect(page.locator("#mobile-hub-root h1")).toHaveText("Workspaces");
}

test("production phone entry retains one real workspace, fixed HTTP/WS/broker scope and all four surfaces through Settings", async ({ hubContext }) => {
  const page = await hubContext.newPage();
  const errors: string[] = [], requests: string[] = [], sockets: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { const url = new URL(request.url()); if (url.pathname.includes("/api/")) requests.push(url.pathname + url.search); });
  page.on("websocket", socket => sockets.push(new URL(socket.url()).pathname));
  await page.goto("/s/mobile-a/README.md#retained");
  await expect(page.locator("#preview-path")).toHaveText("README.md");
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await page.evaluate(() => { (window as any).retainedRoot = document.querySelector(".app-shell"); });
  for (const surface of ["files", "preview", "chat", "terminal"]) {
    await navigation(page); await page.locator(`[data-tab="${surface}"]`).click();
    if (surface === "terminal") await expect(page.locator('[data-terminal-ready="true"]')).toHaveCount(1);
    await hub(page);
    await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("inert", "");
    await page.locator('#mobile-hub-root [data-action="settings"]').click();
    await page.locator('#mobile-hub-root [data-action="preview-side"]').click();
    await page.keyboard.press("Control+`"); await page.keyboard.press("Meta+Shift+f");
    await expect(page.locator("html")).toHaveAttribute("data-active-tab", surface);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator('#mobile-hub-root [data-action="return"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "true");
    await expect(page.locator("html")).toHaveAttribute("data-active-tab", surface);
    expect(await page.evaluate(() => (window as any).retainedRoot === document.querySelector(".app-shell"))).toBe(true);
    await expect(page).toHaveURL(/\/s\/mobile-a\/README.md#retained$/);
  }
  expect(requests.filter(url => url === "/s/mobile-a/api/state")).toHaveLength(1);
  expect(sockets.every(url => url.startsWith("/s/mobile-a/"))).toBe(true);
  expect(requests.filter(url => !url.startsWith("/api/hub/")).every(url => url.startsWith("/s/mobile-a/"))).toBe(true);
  expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
  expect((await openEventSources(page)).some(url => /\/s\/.*\/events/.test(url))).toBe(false);
  expect(errors).toEqual([]); await expect(page.locator("iframe")).toHaveCount(0);
});

test("direct production Hub and safe detail reload never boot a workspace; manage B does not retarget A", async ({ hubContext }) => {
  const page = await hubContext.newPage(); const boots: string[] = [];
  page.on("request", request => { const url = new URL(request.url()); if (/\/s\/[^/]+\/api\/state$/.test(url.pathname) && !url.search) boots.push(request.url()); });
  await page.goto("/settings?detail=security");
  await expect(page.getByRole("heading", { name: "Session Security", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Session Security", exact: true })).toBeVisible();
  expect(boots).toHaveLength(0); await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  await page.goto("/s/mobile-a/README.md"); await expect(page.locator("#preview-path")).toHaveText("README.md");
  await hub(page);
  await page.locator('[data-action="info:mobile-b"]').click();
  await expect(page.locator(".mh-flow-page h1")).toHaveText("mobile-b");
  await page.locator('[data-action="return"]').click();
  await expect(page).toHaveURL(/\/s\/mobile-a\/README.md$/);
  await page.goBack(); await expect(page.locator(".mh-flow-page h1")).toHaveText("mobile-b");
  await page.goForward(); await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "true");
  expect(boots).toHaveLength(1);
});

test("retained workspace opens the sole focused Notifications owner, not a hidden desktop dialog", async ({ hubContext }) => {
  const page = await hubContext.newPage();
  await page.goto("/s/mobile-a/README.md"); await expect(page.locator("#preview-path")).toHaveText("README.md");
  await hub(page); await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="notifications"]').click();
  await expect(page.locator(".mh-notifications")).toBeVisible();
  await expect(page.locator("#uatu-notifications")).toHaveCount(1);
  await expect(page.locator("dialog#uatu-notifications")).toHaveCount(0);
  await expect(page.locator(".mh-dock .mh-tab")).toHaveCount(2);
});

test("authoritative external Stop while Hub is foreground invalidates retained access without implicit Start", async ({ hubContext, hub: info }) => {
  const page = await hubContext.newPage(); let starts = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/start")) starts++; });
  await page.goto("/s/mobile-a/README.md"); await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await hub(page);
  const stopped = await hubContext.request.post("/api/hub/sessions/mobile-a/stop", { headers: { origin: info.origin }, data: {} }); expect(stopped.ok()).toBe(true);
  await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("data-access-invalidated", "");
  await page.goBack(); await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "false");
  expect(starts).toBe(0);
});

test("external current-session revocation closes broker and fences retained workspace behind signed-out recovery", async ({ hubContext, hub: info }) => {
  const page = await hubContext.newPage();
  await page.goto("/s/mobile-a/README.md"); await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await hub(page);
  const response = await hubContext.request.post("/logout", { headers: { origin: info.origin, accept: "application/json" } }); expect(response.ok()).toBe(true);
  await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("data-access-invalidated", "");
  await expect(page.locator('#mobile-hub-root input[type="password"]')).toBeVisible();
  await page.goBack(); await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "false");
});

test("cold production workspace loading Back keeps one boot and late completion cannot steal Hub", async ({ hubContext }) => {
  let release!: () => void, requested!: () => void, boots = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await hubContext.route("**/s/mobile-a/api/state", async route => {
    boots++; const response = await route.fetch(); requested(); await gate; await route.fulfill({ response });
  });
  const page = await hubContext.newPage(); await page.goto("/s/mobile-a/README.md"); await started;
  await expect(page.locator(".mh-coordinator-loading")).toBeVisible();
  await page.getByRole("button", { name: "Back to Hub", exact: true }).click();
  await expect(page.locator("#mobile-hub-root h1")).toHaveText("Workspaces");
  release();
  await expect(page.locator("#preview-path")).toHaveText("README.md");
  await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "false");
  await page.locator('[data-action="return"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-workspace-foreground", "true");
  expect(boots).toBe(1);
});

test("live retained Chat owns the exact File/draft and one upload while broker updates and a fixture PTY progress behind Settings", async ({ hubContext, hub: info }) => {
  const workspace = info.workspaces[0]!;
  const seeded = await childChatControl(workspace, { action: "seed", title: "Retained live draft", items: [] }) as { conversation: { id: string } };
  const page = await hubContext.newPage(); const sockets: string[] = []; let binaryInputs = 0;
  page.on("websocket", socket => { sockets.push(socket.url()); socket.on("framesent", event => { if (typeof event.payload !== "string") binaryInputs++; else if (event.payload.startsWith('{"type":"resize"')) { const size = JSON.parse(event.payload); expect(size.cols).toBeGreaterThan(0); expect(size.rows).toBeGreaterThan(0); } }); });
  await page.goto(`/s/mobile-a/README.md?conversation=${encodeURIComponent(seeded.conversation.id)}`);
  await expect(page.locator("#chat-conversation-select")).toHaveValue(seeded.conversation.id);
  await navigation(page); await page.locator('[data-tab="terminal"]').click(); await expect(page.locator('[data-terminal-ready="true"]')).toHaveCount(1);
  await page.evaluate(() => { (window as any).retainedTerminal = document.querySelector(".xterm"); document.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")!.focus(); });
  const gate = path.join(workspace.path, ".mobile-retention-gate");
  await page.keyboard.type(`while [ ! -e '${gate}' ]; do sleep 0.1; done; printf 'retained-%s\\n' output`); await page.keyboard.press("Enter");
  await navigation(page); await page.locator('[data-tab="chat"]').click(); await page.locator("#chat-input").fill("Exact live retained unsent draft");
  let release!: () => void, held!: () => void, uploads = 0;
  const wait = new Promise<void>(resolve => { held = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  // Keep the browser's original multipart body. APIRequestContext route.fetch
  // can omit WebKit file bytes when replaying an intercepted multipart request.
  await hubContext.route("**/s/mobile-a/api/chat/conversations/*/attachments", async route => { uploads++; held(); await barrier; await route.continue(); });
  const uploaded = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/attachments"));
  await page.evaluate(() => {
    const file = new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6p1sAAAAASUVORK5CYII="), c => c.charCodeAt(0))], "retained.png", { type: "image/png" });
    (window as any).retainedFile = file;
    const append = FormData.prototype.append;
    FormData.prototype.append = function(name: string, value: string | Blob, filename?: string) {
      if (value instanceof File) (window as any).uploadedFile = value;
      if (typeof value === "string") append.call(this, name, value); else append.call(this, name, value, filename ?? (value instanceof File ? value.name : "blob"));
    };
    const data = new DataTransfer(); data.items.add(file); const input = document.querySelector<HTMLInputElement>("#chat-attach-input")!; input.files = data.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => uploads).toBe(1); await wait; await hub(page); await page.locator('[data-action="settings"]').click();
  const before = binaryInputs;
  await page.locator('[data-action="preview-side"]').click(); await page.keyboard.type("NO-PTY-INPUT"); await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(binaryInputs).toBe(before);
  await childChatControl(workspace, { action: "item", conversationId: seeded.conversation.id, item: { id: "retained-stream-item", type: "assistant_message", createdAt: 1, markdown: "Background live broker response" } });
  await writeFile(gate, "release\n"); release();
  expect((await uploaded).status()).toBe(201);
  await page.locator('[data-action="return"]').click();
  await expect(page.locator("#chat-input")).toHaveValue("Exact live retained unsent draft"); await expect(page.locator("#chat-attachments .chat-attachment")).toHaveCount(1);
  await expect(page.locator("#chat-items")).toContainText("Background live broker response");
  expect(await page.evaluate(() => (window as any).retainedFile === (window as any).uploadedFile)).toBe(true); expect(uploads).toBe(1);
  await navigation(page); await page.locator('[data-tab="terminal"]').click();
  await page.getByRole("button", { name: "Select terminal text", exact: true }).click(); await expect(page.locator(".terminal-transcript-text")).toContainText("retained-output");
  expect(await page.evaluate(() => (window as any).retainedTerminal === document.querySelector(".xterm"))).toBe(true); expect(sockets).toHaveLength(1);
});

test("coordinated assignment removal keeps its command owner while authoritative Stop invalidates the retained workspace", async ({ hubContext, hub: info }) => {
  const token = await (await hubContext.request.post("/api/hub/credentials/token", { headers: { origin: info.origin }, data: { name: "Stop dependency fixture", host: "example.test", token: "disposable-fixture-token", capabilities: ["https-git"] } })).json();
  const assigned = await hubContext.request.post(`/api/hub/credentials/${token.credential.id}/assign`, { headers: { origin: info.origin }, data: { workspaceId: "mobile-a", role: "authentication", host: "example.test" } }); expect(assigned.ok()).toBe(true);
  const page = await hubContext.newPage(); await page.goto("/s/mobile-a/README.md"); await expect(page.locator("#preview-path")).toHaveText("README.md");
  await hub(page); await page.locator('[data-action="settings"]').click(); await page.locator('[data-action="assignments"]').click();
  await page.locator('[data-flow="workspace-mobile-a"]').click();
  await page.getByRole("button", { name: "Remove authentication on example.test", exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Stop and continue", exact: true }).click();
  await expect(page.locator(".mh-task, .mh-sheet")).toHaveCount(0);
  await expect(page.locator(".mh-flow-page")).toContainText("No credentials assigned");
  await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("data-access-invalidated", "");
  const state = await (await hubContext.request.get("/api/hub/state")).json(); expect(state.workspaces.find((row: any) => row.id === "mobile-a").running).toBe(false);
});
