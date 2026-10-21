import { existsSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./hub-fixtures";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, hubWorkspaces: ["phone-operations"], hubCredentials: true, hubMobileFlows: true });

test("phone repository token lifecycle masks and clears its secret without creating an agent login", async ({ hubContext }) => {
  const page = await hubContext.newPage(); const agentWrites: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/hub/agent-accounts/")) agentWrites.push(request.url()); });
  await page.goto("/settings?detail=add-credential");
  await page.locator('[data-flow="token"]').click();
  await page.getByLabel("Name", { exact: true }).fill("Disposable HTTPS token"); await page.getByLabel("Provider host", { exact: true }).fill("https://example.test/");
  const secret = page.getByLabel("Token", { exact: true }); await expect(secret).toHaveAttribute("type", "password"); await secret.fill("disposable-no-provider-token");
  await page.locator('.mh-task [data-action="commit-sheet"]').click();
  await expect(page.getByRole("heading", { name: "Disposable HTTPS token", exact: true })).toBeVisible();
  expect(await secret.count()).toBe(0); expect(page.url()).not.toContain("disposable-no-provider-token");
  await expect(page.locator(".mh-flow-page")).not.toContainText("disposable-no-provider-token");
  const catalog = await (await hubContext.request.get("/api/hub/credentials")).json(); expect(catalog.credentials).toHaveLength(1);
  const id = catalog.credentials[0].id;
  await page.locator('[data-flow="toggle"]').click(); await page.locator('[data-action="commit-sheet"]').click();
  await expect(page.locator('[data-flow="toggle"]')).toContainText("Enable");
  await page.locator('[data-flow="toggle"]').click();
  await expect(page.locator('[data-flow="toggle"]')).toContainText("Disable");
  await page.locator('[data-flow="delete"]').click(); await page.locator('[data-action="commit-sheet"]').click();
  await expect.poll(async () => (await (await hubContext.request.get("/api/hub/credentials")).json()).credentials.some((row: any) => row.id === id)).toBe(false);
  expect(agentWrites).toEqual([]);
});

test("a failed foreground authentication revalidation retains an accepted pending credential command", async ({ hubContext }) => {
  const page = await hubContext.newPage();
  let release!: () => void, arrived!: () => void, writes = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }), accepted = new Promise<void>(resolve => { arrived = resolve; });
  await hubContext.route("**/api/hub/credentials/token", async route => {
    writes++; const response = await route.fetch(); expect(response.ok()).toBe(true); arrived(); await gate; await route.fulfill({ response });
  });
  try {
    await page.goto("/settings?detail=add-credential"); await page.locator('[data-flow="token"]').click();
    await page.getByLabel("Name", { exact: true }).fill("Pending revalidation token"); await page.getByLabel("Provider host", { exact: true }).fill("example.test");
    await page.getByLabel("Token", { exact: true }).fill("disposable-revalidation-secret");
    const task = await page.locator(".mh-task").elementHandle(); await page.locator('[data-action="commit-sheet"]').click(); await accepted;
    let failedReads = 0;
    await hubContext.route("**/api/hub/state", async route => { failedReads++; await route.fulfill({ status: 503, contentType: "application/json", body: '{}' }); });
    await page.evaluate(() => window.dispatchEvent(new Event("online"))); await expect.poll(() => failedReads).toBeGreaterThan(0);
    await expect(page.locator('.mh-task [data-hub-revalidation]')).toContainText("The Hub could not confirm this operation.");
    await expect(page.locator(".mh-task")).toHaveAttribute("aria-busy", "true"); expect(await task!.evaluate(el => el.isConnected && el === document.querySelector(".mh-task"))).toBe(true);
    await expect(page.getByLabel("Token", { exact: true })).toHaveValue("");
    await hubContext.unroute("**/api/hub/state"); release();
    await expect(page.getByRole("heading", { name: "Pending revalidation token", exact: true })).toBeVisible(); expect(writes).toBe(1);
  } finally { release(); }
});

test("phone create requires explicit Git consent, separates folder and display identity, and Forget preserves files", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(); let creates = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/hub/workspaces/create") creates++; });
  await page.goto("/?detail=add-workspace"); await page.locator('[data-flow="create"]').click();
  await page.getByLabel("New folder name", { exact: true }).fill("phone-created-folder"); await page.getByLabel("Workspace display name", { exact: true }).fill("Phone display identity");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("Git"); expect(creates).toBe(0);
  await page.getByRole("switch", { name: "Create the folder and initialize Git", exact: true }).check();
  await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("button", { name: "Create stopped", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace configured", exact: true })).toBeVisible();
  expect(creates).toBe(1);
  const state = await (await hubContext.request.get("/api/hub/state")).json(); const created = state.workspaces.find((row: any) => row.displayName === "Phone display identity");
  expect(created).toMatchObject({ running: false, path: path.join(path.dirname(hub.workspaces[0]!.path), "phone-created-folder") });
  await page.getByRole("button", { name: "Workspace details", exact: true }).click();
  await page.getByRole("button", { name: "Forget registration", exact: true }).click();
  await expect(page.locator(".mh-sheet")).toContainText("not files on disk"); await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registration forgotten", exact: true })).toBeVisible(); expect(existsSync(path.join(created.path, ".git"))).toBe(true);
});

test("phone folder maintenance uses real paths, refuses collision and preserves saved-versus-fallback facts", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(); const parent = path.dirname(hub.workspaces[0]!.path);
  const initial = path.join(parent, "phone-empty-folder"), renamed = path.join(parent, "phone-renamed-folder");
  const commit = () => page.locator('.mh-task [data-action="commit-sheet"]').click();
  const browse = async (folder: string) => {
    await page.goto("/?detail=add-workspace"); await page.getByRole("button", { name: /^Manage folders,/ }).click();
    await page.getByRole("button", { name: "Browse elsewhere", exact: true }).click(); await page.getByLabel("Absolute folder path", { exact: true }).fill(folder); await commit();
    await expect(page.getByRole("navigation", { name: "Folder location", exact: true })).toContainText(folder);
  };
  await browse(parent); await page.getByRole("button", { name: "Create empty folder", exact: true }).click(); await page.getByLabel("Folder name", { exact: true }).fill("phone-empty-folder"); await commit();
  await expect(page.getByRole("navigation", { name: "Folder location", exact: true })).toContainText(initial); expect(existsSync(initial)).toBe(true); expect(existsSync(path.join(initial, ".git"))).toBe(false);
  const rename = async (name: string) => { await page.getByRole("button", { name: "Rename folder", exact: true }).click(); await page.getByLabel("New folder name", { exact: true }).fill(name); await commit(); await commit(); };
  await rename(path.basename(hub.workspaces[0]!.path)); await expect(page.locator(".mh-flow-error")).not.toBeEmpty(); expect(existsSync(initial)).toBe(true);
  await rename("phone-renamed-folder"); await expect(page.getByRole("navigation", { name: "Folder location", exact: true })).toContainText(renamed); expect(existsSync(initial)).toBe(false); expect(existsSync(renamed)).toBe(true);
  await page.goto("/settings?detail=default-folder"); await page.locator('[data-flow="edit"]').click(); await page.getByLabel("Folder path", { exact: true }).fill(renamed); await commit();
  await expect(page.locator(".mh-flow-page")).toContainText(renamed);
  await browse(renamed); await page.getByRole("button", { name: "Remove empty folder", exact: true }).click(); await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect(existsSync(renamed)).toBe(true);
  await page.getByRole("button", { name: "Remove empty folder", exact: true }).click(); await commit(); await expect.poll(() => existsSync(renamed)).toBe(false);
  await page.goto("/settings?detail=default-folder"); await expect(page.locator(".mh-flow-page")).toContainText("Saved folder unavailable."); await expect(page.locator(".mh-flow-page")).toContainText(renamed);
  const state = await (await hubContext.request.get("/api/hub/state")).json(); expect(state.workspaces).toHaveLength(1);
});

test("phone clone admits one job through a detour, masks prompt input and registers stopped via real job owners", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(); let submissions = 0;
  // Lose only the accepted HTTP response, not the server's durable admission.
  await hubContext.route("**/api/hub/clone-jobs", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(202); await route.abort("failed");
  });
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/hub/clone-jobs" && request.method() === "POST") submissions++; });
  await page.goto("/clone");
  await page.getByLabel("Remote URL", { exact: true }).fill("https://fixture.invalid/phone-clone.git");
  await page.getByLabel("Destination parent", { exact: true }).fill(path.dirname(hub.workspaces[0]!.path));
  await page.getByLabel("Checkout folder name", { exact: true }).fill("phone-clone-checkout"); await page.getByLabel("Workspace display name", { exact: true }).fill("Phone clone");
  await page.getByRole("button", { name: "Review clone", exact: true }).click(); await page.getByRole("button", { name: "Clone", exact: true }).click();
  const input = page.getByLabel("Response to any remote prompt (always masked)"); await expect(input).toHaveAttribute("type", "password");
  await expect(page.locator(".mh-flow-page")).toContainText("Fixture clone");
  await page.locator('[data-action="settings"]').click(); await page.locator('[data-action="hub"]').click(); await page.locator('[data-action="add-workspace"]').click(); await page.locator('[data-flow="clone"]').click();
  await expect(input).toBeVisible(); await input.fill("disposable-prompt-response"); await page.getByRole("button", { name: "Send response", exact: true }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("registered");
  await expect(page.locator(".mh-flow-page")).not.toContainText("disposable-prompt-response");
  expect(submissions).toBe(1);
  const state = await (await hubContext.request.get("/api/hub/state")).json(); expect(state.workspaces.find((row: any) => row.displayName === "Phone clone")).toMatchObject({ running: false });
});
