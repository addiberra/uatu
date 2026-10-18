import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function directHub(page: Page) {
  await page.clock.install();
  await page.route("/", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-ui-mode="touch"><head><meta name="uatu-hub" content="true"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/direct-hub.css"></head><body><div id="direct-hub" style="position:fixed;inset:0"></div><script type="module" src="/direct-hub.js"></script></body></html>' }));
  await page.goto("/");
}

test.beforeEach(async ({ request }) => { await request.post("/review/reset", { data: { scenario: "branches" } }); });

test("production direct-entry polling keeps keyboard controls and disclosure owners", async ({ page, browserName }) => {
  // Family identity is an explicit test fact, not inferred from similar paths.
  await page.route("**/review/backend/readWorkspaces", async route => {
    const response = await route.fetch(), body = await response.json();
    if (body.status === "available") for (const workspace of body.value) {
      if (workspace.id === "atlas") workspace.repositoryId = "review-family";
      if (workspace.id === "notes") { workspace.repositoryId = "review-family"; workspace.parentId = "atlas"; }
    }
    await route.fulfill({ response, json: body });
  });
  await directHub(page);
  await expect(page.locator("[data-family]").first()).toBeVisible();
  const family = page.locator("[data-family]").first();
  await family.evaluate(el => { (el as HTMLDetailsElement).open = true; });
  for (const control of [family.locator("summary"), family.locator('[data-action^="info:"]').first(), family.locator('[data-action^="open:"]').first()]) {
    await control.focus(); const original = await control.elementHandle();
    const read = page.waitForResponse("**/review/backend/readWorkspaces");
    await page.clock.fastForward(5000); await (await read).finished();
    await expect(control).toBeFocused();
    expect(await original!.evaluate(el => el.isConnected && el === document.activeElement)).toBe(true);
    await expect(family).toHaveAttribute("open");
  }
  // WebKit's default keyboard mode skips buttons; Option-Tab includes them.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test("production polling applies changed and removed facts while preserving summary state and keyboard orientation", async ({ page, browserName }) => {
  let stage = "initial";
  await page.route("**/review/backend/readWorkspaces", async route => {
    const response = await route.fetch(), body = await response.json();
    for (const workspace of body.value) {
      if (["atlas", "notes"].includes(workspace.id)) workspace.repositoryId = "review-family";
      if (workspace.id === "notes") workspace.parentId = "atlas";
      if (workspace.id === "atlas" && stage !== "initial") workspace.displayName = "Updated family";
    }
    if (stage === "removed") body.value = body.value.filter((workspace: { id: string }) => workspace.id !== "atlas");
    await route.fulfill({ response, json: body });
  });
  await directHub(page);
  const family = page.locator('[data-family="repository:review-family"]');
  await expect(family).toBeVisible();
  await family.evaluate(el => { (el as HTMLDetailsElement).open = false; });
  await family.locator("summary").focus(); stage = "changed";
  await page.clock.fastForward(5000);
  await expect(family.locator("summary")).toContainText("Updated family");
  await expect(family.locator("summary")).toBeFocused(); await expect(family).not.toHaveAttribute("open");
  await family.locator("summary").press("Enter");
  await page.locator('[data-action="info:atlas"]').focus(); stage = "removed";
  await page.clock.fastForward(5000);
  await expect(page.locator('[data-action="info:atlas"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeFocused();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

for (const failure of ["workspaces", "authentication", "signed-out", "unauthorized", "changed-user"] as const) test(`production polling handles ${failure} and its recovery without stale owners`, async ({ page }) => {
  let failed = false;
  await page.route("**/review/backend/readAuthentication", async route => {
    if (failed && failure === "authentication") { await route.fulfill({ json: { status: "unavailable", problem: { kind: "unavailable", message: "Revalidation offline" } } }); return; }
    if (failed && failure === "unauthorized") { await route.fulfill({ json: { status: "unavailable", problem: { kind: "unauthorized", message: "Session expired" } } }); return; }
    if (failed && failure === "signed-out") { await route.fulfill({ json: { status: "available", value: { status: "signed-out" } } }); return; }
    const response = await route.fetch(), body = await response.json();
    if (failed && failure === "changed-user") body.value.identity.user = "other-reviewer";
    await route.fulfill({ response, json: body });
  });
  await page.route("**/review/backend/readWorkspaces", async route => {
    if (failed && failure === "workspaces") { await route.fulfill({ json: { status: "unavailable", problem: { kind: "unavailable", message: "Workspace inventory offline" } } }); return; }
    await route.continue();
  });
  await directHub(page);
  const control = page.locator('[data-action="info:atlas"]'); await expect(control).toBeVisible();
  await control.focus(); const original = await control.elementHandle(); failed = true;
  const authentication = page.waitForResponse("**/review/backend/readAuthentication");
  await page.clock.fastForward(5000); await (await authentication).finished();
  if (failure === "signed-out" || failure === "unauthorized") {
    await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
    await expect(control).toHaveCount(0); await expect(page.locator('[data-action="return"]')).toHaveCount(0);
    expect(await original!.evaluate(el => el.isConnected)).toBe(false);
    return; // Auth loss stops the timer; only explicit sign-in may recover it.
  }
  if (failure === "changed-user") {
    await expect.poll(() => original!.evaluate(el => el.isConnected)).toBe(false);
    await expect(control).toBeVisible();
    await page.locator('[data-action="settings"]').click();
    await expect(page.locator(".mh-identity")).toContainText("other-reviewer");
    return;
  }
  await expect(page.getByRole("alert")).toContainText("offline");
  await expect(control).toHaveCount(0);
  failed = false; await page.clock.fastForward(5000);
  await expect(control).toBeVisible(); await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Clone and Rename associate field errors and clear them without losing drafts or focus", async ({ page }, info) => {
  await page.goto("/clone");
  await page.getByLabel("Workspace display name").fill("Preserved clone");
  await page.getByRole("button", { name: "Review clone", exact: true }).click();
  const url = page.getByLabel("Remote URL", { exact: true });
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(url).toHaveAccessibleDescription("Remote URL is required.");
  await url.fill("https://github.com/review/harden.git");
  await expect(url).not.toHaveAttribute("aria-invalid"); await expect(url).toBeFocused();
  await expect(page.getByLabel("Workspace display name")).toHaveValue("Preserved clone");
  await page.getByLabel("Checkout folder name").fill("harden");
  await page.getByRole("button", { name: "Review clone", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review Clone", exact: true })).toContainText("Preserved clone");
  await page.getByRole("button", { name: "Back to edit", exact: true }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page.goto("/");
  await page.locator('[data-action^="info:"]').first().click();
  await page.getByRole("button", { name: "Rename display name", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Display name", exact: true });
  await name.fill(" "); await name.press("Enter");
  await expect(name).toBeFocused(); await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Display name is required.");
  await name.fill("a".repeat(65)); await name.press("Enter");
  await expect(name).toHaveAccessibleDescription("Use 1–64 visible characters for the display name.");
  await expect(page.locator(".mh-sheet-error")).toHaveText("Use 1–64 visible characters for the display name.");
  await page.screenshot({ path: info.outputPath("rename-validation.png") });
  await name.fill("Corrected name"); await expect(name).not.toHaveAttribute("aria-invalid");
  await expect(name).toBeFocused(); await expect(page.locator(".mh-sheet-error")).toBeEmpty();
});

test("Clone phase and completion have one quiet persistent status owner", async ({ page, request }, info) => {
  await page.goto("/clone");
  await page.getByLabel("Remote URL").fill("https://github.com/review/status.git");
  await page.getByLabel("Checkout folder name").fill("status");
  await page.getByLabel("Workspace display name").fill("Status review");
  await page.getByRole("button", { name: "Review clone", exact: true }).click();
  await page.getByRole("button", { name: "Clone", exact: true }).click();
  const status = page.locator("[data-clone-status]");
  await expect(status).toHaveAttribute("role", "status"); await expect(status).toHaveAttribute("aria-atomic", "true");
  const original = await status.elementHandle();
  await status.evaluate(el => {
    el.setAttribute("data-test-mutations", "0");
    new MutationObserver(records => { el.setAttribute("data-test-mutations", String(Number(el.getAttribute("data-test-mutations")) + records.length)); }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const model = await (await request.get("/review/state")).json(); const id = model.model.jobs[0].id;
  expect((await request.post("/review/control/cloneOutput", { data: [id, "progress"] })).ok()).toBe(true);
  await expect(page.locator(".mh-clone-output")).toContainText("Synthetic checkout progress");
  await expect(status).toHaveAttribute("data-test-mutations", "0");
  await request.post("/review/control/clonePhase", { data: [id, "registering"] });
  await expect(status).toContainText("Phase: registering");
  await request.post("/review/control/finishClone", { data: [id, "succeeded"] });
  await expect(status).toContainText("registered stopped");
  expect(await original!.evaluate(el => el.isConnected)).toBe(true);
  expect(await status.ariaSnapshot()).toContain("status");
  await page.screenshot({ path: info.outputPath("clone-complete-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: info.outputPath("clone-complete-wide.png") });
});
