import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { test, expect, openEventSources } from "./hub-fixtures";

test.use({ hubWorktrees: true, hubCredentials: true, hubWorkspaces: ["mobile-inventory", "mobile-other"] });
const exec = promisify(execFile);

test("all rendered phone branding images resolve on production Hub routes and retained Settings", async ({ hubContext }) => {
  const page = await hubContext.newPage();
  const checkImages = async () => {
    const images = page.locator("#mobile-hub-root img");
    expect(await images.count()).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute("src", "/hub-assets/logo.svg");
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const response = await hubContext.request.get((await image.getAttribute("src"))!);
      expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toContain("image/svg+xml");
    }
  };
  for (const route of ["/", "/settings", "/settings?detail=security", "/clone"]) {
    await page.goto(route);
    await expect(page.locator("#mobile-hub-root .mh-brand")).toBeVisible();
    await expect(page.locator("#mobile-hub-root .mh-dock")).toBeVisible();
    await checkImages();
  }
  await page.goto("/s/mobile-inventory/README.md");
  await expect(page.locator("#preview-path")).toHaveText("README.md");
  await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
  if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
  await page.locator("#navigation-hub").click();
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator("#mobile-hub-root .mh-identity")).toBeVisible();
  await checkImages();
});

test("retained inventory reconciles changes missed during editor and checkout detail before resuming", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(), source = hub.workspaces[0]!;
  const git = (args: string[]) => exec("git", ["-C", source.path, ...args]);
  const folders: string[] = [];
  let reads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/hub/worktrees") reads++; });
  await page.addInitScript(() => {
    (window as any).inventoryResumeInvalidations = 0;
    window.addEventListener("uatu:worktrees-invalidated", () => { (window as any).inventoryResumeInvalidations++; });
  });
  try {
    await page.goto("/s/mobile-inventory/README.md");
    await expect(page.locator("#preview-path")).toHaveText("README.md");
    await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => (window as any).inventoryResumeInvalidations)).toBeGreaterThan(0);
    const workspace = await page.locator("#mobile-workspace-root").elementHandle();
    await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
    if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
    await page.locator("#navigation-hub").click();
    await page.locator('[data-action="info:mobile-inventory"]').click();
    await page.getByRole("button", { name: /Branches and worktrees/ }).click();
    await expect(page.getByRole("button", { name: "Create branch or worktree", exact: true })).toBeVisible();
    for (const child of ["editor", "detail"] as const) {
      await expect(page.locator("[data-worktree-inventory]")).not.toHaveAttribute("aria-busy", "true");
      const before = reads, branch = `resume-${child}`, folder = path.join(path.dirname(source.path), branch);
      if (child === "editor") {
        await page.getByRole("button", { name: "Create branch or worktree", exact: true }).click();
        await page.getByLabel("New branch name").fill("preserved-until-cancel");
      } else await page.getByRole("button", { name: /^main,/ }).click();
      const childRoot = await page.locator(child === "editor" ? ".mh-task" : ".mh-flow-page h1").elementHandle();
      const invalidations = await page.evaluate(() => (window as any).inventoryResumeInvalidations);
      await git(["worktree", "add", "-b", branch, folder, "main"]); folders.push(folder);
      await expect.poll(() => page.evaluate(() => (window as any).inventoryResumeInvalidations)).toBeGreaterThan(invalidations);
      expect(reads).toBe(before);
      expect(await childRoot!.evaluate(el => el.isConnected)).toBe(true);
      if (child === "editor") await expect(page.getByLabel("New branch name")).toHaveValue("preserved-until-cancel");
      expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
      if (child === "editor") await page.getByRole("button", { name: "Cancel", exact: true }).click();
      else await page.locator('.mh-flow-page [data-flow="flow-back"]').click();
      await expect(page.getByRole("button", { name: new RegExp(`^${branch},`) })).toBeVisible();
      expect(reads).toBeGreaterThan(before);
      expect(await workspace!.evaluate(el => el === document.querySelector("#mobile-workspace-root"))).toBe(true);
      expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
    }
  } finally {
    await page.close();
    for (const folder of folders) await git(["worktree", "remove", folder]);
  }
});

for (const entry of ["direct", "retained", "retained-other"] as const) test(`${entry} inventory follows external Git changes through its existing refresh owner on one stream without replacing a draft`, async ({ hubContext, hub }) => {
  test.setTimeout(60_000);
  const page = await hubContext.newPage(), source = hub.workspaces[entry === "retained-other" ? 1 : 0]!;
  const branch = `live-${entry}`, folder = path.join(path.dirname(source.path), branch);
  const git = (args: string[]) => exec("git", ["-C", source.path, ...args]);
  let reads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/hub/worktrees") reads++; });
  try {
    if (entry === "direct") await page.goto("/?detail=workspace&id=mobile-inventory");
    else {
      await page.goto("/s/mobile-inventory/README.md");
      await expect(page.locator("#preview-path")).toHaveText("README.md");
      await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
      await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
      if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
      await page.locator("#navigation-hub").click();
      await page.locator(`[data-action="info:${source.id}"]`).click();
    }
    await page.getByRole("button", { name: /Branches and worktrees/ }).click();
    await expect(page.getByRole("button", { name: "Create branch or worktree", exact: true })).toBeVisible();
    await expect.poll(async () => (await openEventSources(page)).filter(url => url.includes("/api/hub/live?")).length).toBe(1);
    // The direct inventory's attach always supplies a fresh invalidation.
    // Do not let its initial read accidentally include the later Git change.
    if (entry === "direct") await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
    await expect(page.locator("[data-worktree-inventory]")).not.toHaveAttribute("aria-busy", "true");
    const heading = await page.locator(".mh-flow-page h1").elementHandle(), url = page.url();
    await expect(page.locator(".mh-flow-page")).not.toContainText(branch);
    await page.getByRole("button", { name: "Create branch or worktree", exact: true }).focus();
    const before = reads;
    await git(["worktree", "add", "-b", branch, folder, "main"]);
    await expect(page.getByRole("button", { name: new RegExp(`^${branch},`) })).toBeVisible({ timeout: 15_000 });
    expect(reads).toBeGreaterThan(before); expect(page.url()).toBe(url);
    expect(await heading!.evaluate(el => el === document.querySelector(".mh-flow-page h1"))).toBe(true);
    await expect(page.getByRole("button", { name: "Create branch or worktree", exact: true })).toBeFocused();
    expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
    await page.getByRole("button", { name: "Create branch or worktree", exact: true }).click();
    const task = await page.locator(".mh-task").elementHandle();
    await page.getByLabel("New branch name").fill("kept-live-draft");
    const draftReads = reads;
    await page.evaluate(() => window.dispatchEvent(new Event("uatu:worktrees-invalidated")));
    await expect(page.getByLabel("New branch name")).toHaveValue("kept-live-draft");
    expect(await task!.evaluate(el => el === document.querySelector(".mh-task"))).toBe(true);
    expect(reads).toBe(draftReads);
    if (entry === "direct") await expect.poll(() => openEventSources(page)).toEqual([]);
    else expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${branch},`) })).toBeVisible();
    await page.locator('[data-action="settings"]').click();
    if (entry === "direct") await expect.poll(() => openEventSources(page)).toEqual([]);
    else {
      expect((await openEventSources(page)).filter(url => url.includes("/api/hub/live?"))).toHaveLength(1);
      if (entry === "retained") {
        // Closing the inventory must not replace/close hub-nav's existing
        // topic consumer. It still relays later changes behind Settings.
        await page.evaluate(() => {
          (window as any).afterInventoryInvalidations = 0;
          window.addEventListener("uatu:worktrees-invalidated", () => { (window as any).afterInventoryInvalidations++; });
        });
        await git(["worktree", "remove", folder]);
        await expect.poll(() => page.evaluate(() => (window as any).afterInventoryInvalidations), { timeout: 15_000 }).toBeGreaterThan(0);
      }
    }
  } finally {
    await page.close();
    await git(["worktree", "remove", folder]).catch(() => {});
  }
});
