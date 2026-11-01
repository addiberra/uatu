import type { Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import { test, expect } from "./fixtures";
import { workspacePath } from "./config";
import { showSurface } from "./navigation-helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const svg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${color}"/></svg>`;
const extras = { "nav/.first.md": "# First", "nav/b #?.svg": svg("red"), "nav/c.ts": "const value = 1;", "nav/d.bin": "\u0000unsupported", "nav/nested/ignored.md": "# Nested" };
const overlay = (page: Page) => page.locator("#preview-file-navigation");
const next = (page: Page) => overlay(page).getByRole("button", { name: "Next file", exact: true });
const back = (page: Page) => overlay(page).getByRole("button", { name: "Back to Files" });
async function boot(page: Page, url = "/nav/.first.md") {
  await page.goto(url);
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toHaveAttribute("aria-busy", "false");
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/__e2e/reset", { data: { extras, follow: false } });
  expect(reset.ok(), "Preview navigation fixture reset must succeed").toBe(true);
});

test("a connected partial inventory never reports a sibling boundary", async ({ page, request }) => {
  await request.post("/__e2e/reset", { data: { extras, follow: false, holdDiscovery: true, nativeWatch: true } });
  try {
    await page.goto("/nav/.first.md");
    await expect(page.locator("#preview")).toContainText("First");
    await expect(overlay(page)).toContainText("Loading file index");
    await expect(next(page)).toBeDisabled();
    await expect(overlay(page).getByRole("button", { name: /first file|last file/ })).toHaveCount(0);
    await expect(back(page)).toBeEnabled();
    await request.post("/__e2e/reset", { data: { releaseDiscovery: true } });
    await expect(next(page)).toBeEnabled();
    await expect(page.locator("#preview-path")).toHaveText("nav/.first.md");
  } finally {
    await page.close();
    await request.post("/__e2e/reset");
  }
});

test("explicit binary URLs and reload select indexed images or the binary fallback", async ({ page }) => {
  for (const path of ["nav/b #?.svg", "nav/d.bin"]) {
    await page.goto(`/${path.split("/").map(encodeURIComponent).join("/")}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(page.locator("#preview-path")).toHaveText(path);
      await expect(overlay(page)).toBeVisible();
      if (path.endsWith(".svg")) await expect(page.locator("#preview .image-preview img")).toBeVisible();
      else await expect(page.locator("#preview")).toContainText("isn't viewable");
      await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
      expect(await page.evaluate(() => history.state.documentId)).toBeTruthy();
      if (attempt === 0) await page.reload();
    }
  }
});

test("mixed siblings, boundaries, reserved image URLs, history and Back to the same tree", async ({ page }) => {
  await boot(page);
  await expect(overlay(page).getByRole("button", { name: "Previous file (first file)", exact: true })).toBeDisabled();
  await next(page).click();
  await expect(page.locator("#preview img")).toBeVisible();
  await expect(page).toHaveURL(/\/nav\/b%20%23%3F.svg$/);
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
  const imageId = await page.evaluate(() => history.state.documentId);
  await next(page).click();
  await expect(page.locator("#preview-path")).toHaveText("nav/c.ts");
  await page.goBack();
  await expect(page.locator("#preview img")).toBeVisible();
  expect(await page.evaluate(() => history.state.documentId)).toBe(imageId);
  await back(page).click();
  await expect(overlay(page)).toBeHidden();
  await expect(page.locator('#tree [data-item-path="nav/b #?.svg"]')).toHaveAttribute("aria-selected", "true");
  await page.locator("#navigation-handle").click();
  await page.locator("#touch-tab-preview").click();
  await expect(page.locator("#preview img")).toBeVisible();
  await next(page).click();
  await next(page).click();
  await expect(page.locator("#preview")).toContainText("isn't viewable");
  await expect(overlay(page).getByRole("button", { name: "Next file (last file)", exact: true })).toBeDisabled();
  await expect(page.locator("#tree")).toHaveCount(1);
});

test("single-file and non-file previews omit arrows; live desktop mode hides the overlay", async ({ page, request }) => {
  const singleFile = await request.post("/__e2e/reset", { data: { file: "README.md", follow: false } });
  expect(singleFile.ok(), "Single-file fixture reset must succeed").toBe(true);
  await boot(page, "/README.md");
  await expect(overlay(page).getByRole("button", { name: /Previous|Next/ })).toHaveCount(0);
  await back(page).click();
  await page.locator("#ui-mode-toggle").click();
  await expect(overlay(page)).toBeHidden();
  const folder = await request.post("/__e2e/reset", { data: { follow: false } });
  expect(folder.ok(), "Folder fixture reset must succeed").toBe(true);
  await page.goto("/not-found.md");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(back(page)).toBeVisible();
  await expect(overlay(page).getByRole("button", { name: /Previous|Next/ })).toHaveCount(0);
});

test("failed load and timeout retain exact target, reject late results and recover without reload", async ({ page }) => {
  await boot(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/document/resource?**", async route => { await held; await route.continue().catch(() => {}); });
  await next(page).click();
  await expect(overlay(page)).toContainText("Loading selected file");
  await expect(back(page)).toBeEnabled();
  await expect(overlay(page).getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 15_000 });
  await expect(overlay(page)).toContainText("timed out");
  const intended = await page.evaluate(() => history.state.documentId);
  await fs.rm(workspacePath("nav/b #?.svg"));
  await expect.poll(async () => (await page.request.get("/api/state").then(response => response.json())).roots.flatMap((root: any) => root.docs).some((doc: any) => doc.id === intended)).toBe(false);
  await overlay(page).getByRole("button", { name: "Retry" }).click();
  await expect(overlay(page)).toContainText("unavailable in the current scope");
  expect(await page.evaluate(() => history.state.documentId)).toBe(intended);
  release();
  await page.unroute("**/api/document/resource?**");
  await fs.writeFile(workspacePath("nav/b #?.svg"), svg("blue"));
  await expect.poll(async () => (await page.request.get("/api/state").then(response => response.json())).roots.flatMap((root: any) => root.docs).some((doc: any) => doc.id === intended)).toBe(true);
  await overlay(page).getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#preview img")).toBeVisible();
  expect(await page.evaluate(() => history.state.documentId)).toBe(intended);
});

test("index failure is not a boundary and explicit retry keeps the page", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { (window as any).__previewSentinel = {}; });
  await page.route("**/api/state**", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.route("**/api/hub/live**", route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(overlay(page)).toContainText("File index unavailable");
  await expect(overlay(page).getByRole("button", { name: /first file|last file/ })).toHaveCount(0);
  await expect(back(page)).toBeEnabled();
  await page.unroute("**/api/state**");
  await page.unroute("**/api/hub/live**");
  await overlay(page).getByRole("button", { name: "Retry" }).click();
  await expect(next(page)).toBeEnabled();
  expect(await page.evaluate(() => Boolean((window as any).__previewSentinel))).toBe(true);
});

// Hold delivery, not server time: the page's clock drives only the client
// deadline. These cases must exercise the real renderer/selection owners.
async function holdTextDelivery(page: Page) {
  const received = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/document?**", async route => {
    if (!new URL(route.request().url()).searchParams.get("id")?.endsWith("/nav/c.ts")) return route.continue();
    const response = await route.fetch();
    received.resolve();
    await release.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  return { received: received.promise, release: () => release.resolve() };
}

async function switchMode(page: Page, mode: "touch" | "desktop") {
  if (await page.locator("html").getAttribute("data-ui-mode") === mode) return;
  if (mode === "desktop") await showSurface(page, "files");
  await page.locator("#ui-mode-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-mode", mode);
}

test("desktop slow delivery still mounts beyond the touch deadline", async ({ page }) => {
  await boot(page);
  await switchMode(page, "desktop");
  const held = await holdTextDelivery(page);
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.locator('#tree [data-item-path="nav/c.ts"]').click();
    await held.received;
    await page.clock.runFor(11_000);
    held.release();
    await expect(page.locator("#preview")).toContainText("const value = 1;");
    await expect(page.locator("#preview-path")).toHaveText("nav/c.ts");
    await expect(overlay(page)).toBeHidden();
  } finally { held.release(); }
});

test("leaving touch cancels its pending deadline without rejecting slow desktop delivery", async ({ page }) => {
  await boot(page);
  const held = await holdTextDelivery(page);
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await back(page).click();
    await page.locator('#tree [data-item-path="nav/c.ts"]').click();
    await held.received;
    await switchMode(page, "desktop");
    await page.clock.runFor(11_000);
    held.release();
    await expect(page.locator("#preview")).toContainText("const value = 1;");
    await expect(overlay(page)).toBeHidden();
  } finally { held.release(); }
});

test("entering touch arms recovery for an already pending desktop load", async ({ page }) => {
  await boot(page);
  await switchMode(page, "desktop");
  const held = await holdTextDelivery(page);
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.locator('#tree [data-item-path="nav/c.ts"]').click();
    await held.received;
    await page.clock.runFor(11_000);
    await switchMode(page, "touch");
    await page.clock.runFor(10_001);
    await expect(overlay(page)).toContainText("timed out");
    await expect(overlay(page).getByRole("button", { name: "Retry" })).toBeVisible();
    held.release();
    await page.unroute("**/api/document?**");
    await overlay(page).getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("#preview")).toContainText("const value = 1;");
  } finally { held.release(); }
});

test("leaving a timed-out touch load retries in desktop instead of hiding its only recovery", async ({ page }) => {
  await boot(page);
  const held = await holdTextDelivery(page);
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await back(page).click();
    await page.locator('#tree [data-item-path="nav/c.ts"]').click();
    await held.received;
    await page.clock.runFor(10_001);
    await expect(overlay(page)).toContainText("timed out");
    // Only the retry's fresh request may mount; the timed-out response stays
    // held until after desktop recovered, proving it cannot revive itself.
    await page.unroute("**/api/document?**");
    await switchMode(page, "desktop");
    await expect(page.locator("#preview")).toContainText("const value = 1;");
    await expect(overlay(page)).toBeHidden();
    held.release();
    await expect(page.locator("#preview-path")).toHaveText("nav/c.ts");
  } finally { held.release(); }
});

test("duplicate-root images and same-path history restore exact identities", async ({ page, request }) => {
  await request.post("/__e2e/reset", { data: { roots: ["one", "two"], follow: false, extras: {
    "one/a.md": "# One", "one/b.svg": svg("red"), "two/a.md": "# Two", "two/b.svg": svg("blue"),
  } } });
  await boot(page, "/a.md");
  await back(page).click();
  await page.locator('#tree [data-item-path="two/"]').click();
  await page.locator('#tree [data-item-path="two/a.md"]').click();
  await expect(page.locator("#preview")).toContainText("Two");
  await next(page).click();
  const image = page.locator("#preview img");
  await expect(image).toBeVisible();
  expect(await page.request.get((await image.getAttribute("src"))!).then(response => response.text())).toContain('fill="blue"');
  await page.goBack();
  await expect(page.locator("#preview")).toContainText("Two");
  await page.goBack();
  await expect(page.locator("#preview")).toContainText("One");
  await page.goForward();
  await expect(page.locator("#preview")).toContainText("Two");
});

test("Changed filtering, compare target, expanded tree and fragments survive sibling navigation", async ({ page, request }) => {
  await request.post("/__e2e/reset", { data: {
    extras, git: true, follow: false, dirty: { "nav/.first.md": "# First\n\nChanged selected file." },
  } });
  await boot(page, "/nav/.first.md#first");
  await expect(page).toHaveURL(/#first$/);
  await back(page).click();
  await page.locator("#files-pane-filter-changed").click();
  await page.locator('[data-compare-target="last-commit"]').click();
  await expect(page.locator('[data-compare-target="last-commit"]')).toHaveAttribute("aria-pressed", "true");
  await showSurface(page, "preview");
  await next(page).click();
  await expect(page.locator("#preview img")).toBeVisible();
  await back(page).click();
  await expect(page.locator("#files-pane-filter-changed")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-compare-target="last-commit"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#tree [data-item-path="nav/"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('#tree [data-item-path="nav/b #?.svg"]')).toHaveAttribute("aria-selected", "true");
  await showSurface(page, "preview");
  await page.goBack();
  await expect(page.locator("#preview-path")).toHaveText("nav/.first.md");
  await expect(page).toHaveURL(/#first$/);
  await expect(page.locator("#preview")).toContainText("Changed selected file.");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
});

test("measured selector clearance, persistent dismissal, right side and enlarged controls", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => document.documentElement.style.fontSize = "200%");
  const group = overlay(page);
  await expect.poll(async () => {
    const a = await group.boundingBox();
    const b = await page.locator("#touch-tab-bar").boundingBox();
    return !!a && !!b && a.y + a.height <= b.y;
  }).toBe(true);
  await page.locator("#navigation-close").click();
  await expect(page.locator("#touch-tab-bar")).toBeHidden();
  await expect(group).toBeVisible();
  // The bar has no Preferences button; hold the handle to open the sheet.
  const handleBox = (await page.locator("#navigation-handle").boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.locator("#navigation-preferences-dialog")).toBeVisible();
  await page.locator("#navigation-preview-side").selectOption("right");
  await page.keyboard.press("Escape");
  await expect(group).toHaveAttribute("data-side", "right");
  for (const size of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const box = await group.boundingBox();
      return !!box && box.x >= 0 && box.x + box.width <= size.width && box.y >= 0;
    }).toBe(true);
    await expect(back(page)).toBeVisible();
  }
});

// Task 6.2 requires that Previous/Next selection runs *in page*, through the
// existing owners, rather than reloading the workspace. The observable
// consequence is that the other surfaces keep their live resources. An unsent
// Chat draft and a running PTY are the two that a document switch would
// plausibly destroy, so they stand in for the requirement here.
// Step through two siblings and back, leaving the selection where it started.
async function stepThroughSiblings(page: Page): Promise<void> {
  await expect(page.locator("#preview-path")).toHaveText("nav/.first.md");
  await next(page).click();
  await expect(page.locator("#preview-path")).not.toHaveText("nav/.first.md");
  await next(page).click();
  await overlay(page).getByRole("button", { name: "Previous file", exact: true }).click();
  await overlay(page).getByRole("button", { name: "Previous file", exact: true }).click();
  await expect(page.locator("#preview-path")).toHaveText("nav/.first.md");
}

// Chat and Terminal both sit behind the workspace token cookie, so these two
// tests establish it before landing on the document under test.
async function bootWithToken(page: Page, request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  const token = await request.get("/__e2e/terminal-token").then(response => response.json());
  if (!token.enabled) return false;
  await page.goto(`/?t=${encodeURIComponent(token.token)}`);
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await boot(page);
  return true;
}

test("in-page selection preserves an unsent Chat draft and its conversation", async ({ page, request }) => {
  await request.post("/__e2e/chat", { data: { action: "seed", title: "Sibling navigation", items: [] } });
  if (!await bootWithToken(page, request)) test.skip(true, "workspace token unavailable on this platform");

  await showSurface(page, "chat");
  await expect(page.locator("#chat-surface")).toBeVisible();
  await page.locator("#chat-input").fill("draft that must survive sibling navigation");

  await showSurface(page, "preview");
  await stepThroughSiblings(page);

  // The draft is still unsent, still in the same conversation: the Chat
  // surface was never torn down and rebuilt by the document switches.
  await showSurface(page, "chat");
  await expect(page.locator("#chat-surface")).toBeVisible();
  await expect(page.locator("#chat-input")).toHaveValue("draft that must survive sibling navigation");
});

test("in-page selection preserves the Terminal PTY and its output", async ({ page, request }) => {
  if (!await bootWithToken(page, request)) test.skip(true, "terminal backend unavailable on this platform");

  await showSurface(page, "terminal");
  const pane = page.locator(".terminal-pane").first();
  await expect(page.locator(".terminal-pane-host .xterm").first()).toBeVisible();
  const sessionId = await pane.getAttribute("data-session-id");
  expect(sessionId).toBeTruthy();

  // Wait for the prompt before typing; a freshly spawned shell can swallow
  // keystrokes sent while it is still initializing.
  const rows = page.locator(".terminal-pane-host .xterm-rows > div");
  await expect.poll(
    async () => (await rows.allTextContents()).some(text => text.trim().length > 0),
    { timeout: 10_000, message: "shell prompt must render before typing" },
  ).toBe(true);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.type("echo sibling-$((6*7))");
  await page.keyboard.press("Enter");
  await expect.poll(
    async () => (await rows.allTextContents()).some(text => text.trim() === "sibling-42"),
    { timeout: 15_000, message: "the PTY must echo the command output" },
  ).toBe(true);

  await showSurface(page, "preview");
  await stepThroughSiblings(page);

  // Same PTY, same scrollback: selection did not reload the workspace or
  // reattach to a new session.
  await showSurface(page, "terminal");
  await expect(page.locator(".terminal-pane-host .xterm").first()).toBeVisible();
  expect(await pane.getAttribute("data-session-id")).toBe(sessionId);
  expect((await rows.allTextContents()).some(text => text.trim() === "sibling-42")).toBe(true);
});
