import { existsSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./hub-fixtures";

test.use({ hubWorkspaces: ["phone-operations"], hubCredentials: true, hubMobileFlows: true });

test("phone repository token lifecycle masks and clears its secret without creating an agent login", async ({ hubContext }) => {
  const page = await hubContext.newPage(); await page.goto("/settings?detail=add-credential");
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
});

test("phone create requires explicit Git consent, separates folder and display identity, and Forget preserves files", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(); let creates = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/hub/workspaces/create") creates++; });
  await page.goto("/?detail=add-workspace"); await page.locator('[data-flow="create"]').click();
  await page.getByLabel("New folder name", { exact: true }).fill("phone-created-folder"); await page.getByLabel("Workspace display name", { exact: true }).fill("Phone display identity");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("Git"); expect(creates).toBe(0);
  await page.getByRole("switch", { name: "Create the folder and initialize Git", exact: true }).check();
  await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("button", { name: "Add stopped", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace configured", exact: true })).toBeVisible();
  expect(creates).toBe(1);
  const state = await (await hubContext.request.get("/api/hub/state")).json(); const created = state.workspaces.find((row: any) => row.displayName === "Phone display identity");
  expect(created).toMatchObject({ running: false, path: path.join(path.dirname(hub.workspaces[0]!.path), "phone-created-folder") });
  await page.getByRole("button", { name: "Workspace information", exact: true }).click();
  await page.getByRole("button", { name: "Forget registration", exact: true }).click();
  await expect(page.locator(".mh-sheet")).toContainText("not files on disk"); await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registration forgotten", exact: true })).toBeVisible(); expect(existsSync(path.join(created.path, ".git"))).toBe(true);
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
