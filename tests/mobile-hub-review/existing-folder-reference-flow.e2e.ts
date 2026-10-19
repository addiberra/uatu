import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { namedButton as button, activeTask, assertDisposableReview } from "./navigation";
import type { ReviewControl, ReviewControlArguments } from "./controller";

async function control<K extends ReviewControl>(request: APIRequestContext, name: K, args: ReviewControlArguments<K>) {
  expect((await request.post(`/review/control/${name}`, { data: args })).ok()).toBe(true);
}
const state = async (request: APIRequestContext) => (await request.get("/review/state")).json();
async function choose(page: Page, name: string) {
  await button(page, name).click(); await button(page, "Choose").click();
}
async function editor(page: Page, folder = "existing") {
  await page.goto("/?detail=add-workspace"); await button(page, "Existing folder").click();
  await choose(page, folder);
  await expect(activeTask(page, "editor", "Add Existing Folder")).toBeVisible();
}
async function changeFolder(page: Page, folder: string) {
  await button(page, "Choose another folder").click();
  await page.locator('[data-flow="up"]').click(); await choose(page, folder);
}
const mutations = (s: { log: { method: string }[] }) => s.log.filter(r => ["configureExisting", "createWorkspace", "createFolder", "renameFolder", "startWorkspace"].includes(r.method));
test.beforeEach(async ({ request, page, baseURL }) => {
  await assertDisposableReview(request, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await request.post("/review/reset", { data: { scenario: "mixed" } })).ok()).toBe(true);
});

test("folder choice suggests identity until explicitly edited; picker Back preserves context and consent is location-specific", async ({ page, request }) => {
  await editor(page); const name = page.getByLabel("Workspace display name", { exact: true });
  await expect(name).toHaveValue("existing");
  await changeFolder(page, "empty-folder"); await expect(name).toHaveValue("empty-folder");
  await page.getByLabel("Initialize Git in this folder", { exact: true }).check();
  await name.fill("My identity");
  await button(page, "Choose another folder").click(); await page.goBack();
  await expect(name).toHaveValue("My identity");
  await expect(page.getByLabel("Initialize Git in this folder", { exact: true })).toBeChecked();
  await changeFolder(page, "existing"); await expect(name).toHaveValue("My identity");
  await name.fill(""); await changeFolder(page, "empty-folder");
  await expect(name).toHaveValue(""); await expect(page.getByLabel("Initialize Git in this folder", { exact: true })).not.toBeChecked();
  expect(mutations(await state(request))).toHaveLength(0);
  await button(page, "Cancel").click(); await expect(button(page, "Existing folder")).toBeVisible();
});

test("optional drafts retain closed/open and review Back state; current hidden validation reopens without losing controls", async ({ page, request }) => {
  await editor(page); const details = page.locator("[data-setup-credentials]"); const summary = details.locator("summary");
  await expect(details).not.toHaveAttribute("open");
  const start = page.getByLabel("Start after configuration", { exact: true });
  await expect(start).not.toBeChecked(); expect(await start.evaluate(el => !el.closest("details"))).toBe(true);
  const safety = page.getByRole("region", { name: "Credential safety details", exact: true });
  await expect(safety).toBeVisible(); await expect(safety).toContainText("Do not run untrusted projects");
  expect(await safety.evaluate(el => !el.closest("details") && !!(el.compareDocumentPosition(document.querySelector("[data-setup-credentials]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await summary.click(); const auth = page.getByRole("combobox", { name: "Git authentication", exact: true });
  const host = page.getByLabel("Authentication host", { exact: true });
  await auth.selectOption("ssh-open"); await host.fill("github.com");
  await page.getByRole("combobox", { name: "Commit signing", exact: true }).selectOption("pgp-locked");
  await summary.click(); await summary.click(); await expect(host).toHaveValue("github.com");
  await host.fill(""); await summary.click(); await button(page, "Review").click();
  await expect(details).toHaveAttribute("open"); await expect(host).toHaveAccessibleDescription("Enter an authentication host.");
  await host.fill("https://"); await summary.click(); await button(page, "Review").click();
  await expect(details).toHaveAttribute("open"); await expect(host).toHaveAttribute("aria-invalid", "true");
  await expect(host).not.toHaveAccessibleDescription("Enter an authentication host.");
  await host.fill("github.com"); await expect(host).not.toHaveAttribute("aria-invalid");
  await summary.click(); await button(page, "Review").click();
  await expect(activeTask(page)).toContainText("/synthetic/existing"); await expect(activeTask(page)).toContainText("github.com");
  await button(page, "Back to edit").click(); await expect(details).not.toHaveAttribute("open");
  await summary.click(); await expect(host).toHaveValue("github.com"); await expect(auth).toHaveValue("ssh-open");
  await button(page, "Choose another folder").click(); await button(page, "Cancel").click();
  await expect(details).toHaveAttribute("open"); await expect(host).toHaveValue("github.com");
  await expect(page.getByRole("combobox", { name: "Commit signing", exact: true })).toHaveValue("pgp-locked");
  expect(mutations(await state(request))).toHaveLength(0);
});

test("existing repository adds stopped without folder effects; explicit outcome Start uses unassigned guard", async ({ page, request }) => {
  await editor(page); await expect(page.getByLabel("Initialize Git in this folder", { exact: true })).toHaveCount(0);
  await button(page, "Review").click(); await expect(activeTask(page)).toContainText("Exact selected folder on Hub");
  await expect(activeTask(page)).toContainText("do not create or rename"); await expect(activeTask(page)).toContainText("None");
  expect(mutations(await state(request))).toHaveLength(0);
  const configured = page.waitForRequest(r => r.url().endsWith("/review/backend/configureExisting"));
  await button(page, "Add stopped").click(); await expect(button(page, "Start workspace")).toBeVisible();
  await expect(page.locator(".mh-flow-page")).toContainText("Stopped");
  const before = await state(request); expect(mutations(before).map(r => r.method)).toEqual(["configureExisting"]);
  expect((await configured).postDataJSON()[0]).toMatchObject({ path: "/synthetic/existing", init: false, start: false, authentication: [], signing: null });
  await button(page, "Start workspace").click(); await expect(activeTask(page, "confirmation")).toContainText("Start without credentials?");
  expect(mutations(await state(request)).map(r => r.method)).toEqual(["configureExisting"]);
  await button(page, "Cancel").click(); await button(page, "Start workspace").click(); await button(page, "Start").click();
  await expect.poll(async () => (await state(request)).model.workspaces.find((w: { path: string }) => w.path === "/synthetic/existing").runtime.status).toBe("running");
});

test("nonrepository still requires explicit init consent; review Back preserves it and registration stays stopped", async ({ page, request }) => {
  await editor(page, "empty-folder"); await button(page, "Review").click();
  await expect(page.getByRole("alert")).toContainText("Confirm Git initialization"); expect(mutations(await state(request))).toHaveLength(0);
  await page.getByLabel("Initialize Git in this folder", { exact: true }).check(); await button(page, "Review").click();
  await expect(activeTask(page)).toContainText("Explicitly authorized in this folder if needed");
  await button(page, "Back to edit").click(); await expect(page.getByLabel("Initialize Git in this folder", { exact: true })).toBeChecked();
  await button(page, "Review").click();
  const configured = page.waitForRequest(r => r.url().endsWith("/review/backend/configureExisting"));
  await button(page, "Add stopped").click(); await expect(button(page, "Start workspace")).toBeVisible();
  const s = await state(request); expect(mutations(s).map(r => r.method)).toEqual(["configureExisting"]);
  expect((await configured).postDataJSON()[0]).toMatchObject({ path: "/synthetic/empty-folder", init: true, start: false });
});

test("locked signing on outcome Start keeps existing readiness/unlock fence", async ({ page, request }) => {
  await editor(page); await page.locator("[data-setup-credentials] > summary").click();
  await page.getByRole("combobox", { name: "Commit signing", exact: true }).selectOption("pgp-locked");
  await button(page, "Review").click(); await button(page, "Add stopped").click(); await button(page, "Start workspace").click();
  await expect(activeTask(page)).toContainText("Unlock workspace credential"); await expect(page.locator('input[type="password"]')).toBeVisible();
  expect((await state(request)).model.workspaces.find((w: { path: string }) => w.path === "/synthetic/existing").runtime.status).toBe("stopped");
});

test("requested session outcome reads current running/failed state", async ({ page, request }) => {
  for (const failed of [false, true]) {
    await request.post("/review/reset", { data: { scenario: "mixed" } });
    if (failed) await control(request, "setOnboardingFault", ["start-failed"]);
    await editor(page); await page.getByLabel("Start after configuration", { exact: true }).check();
    await button(page, "Review").click(); await button(page, "Add and start").click();
    await expect(button(page, failed ? "Start workspace" : "Open workspace")).toBeVisible();
    await expect(page.locator(".mh-flow-page")).toContainText(failed ? "Stopped" : "Running");
    if (failed) await expect(page.locator(".mh-flow-page")).toContainText("Start failed:");
    await expect(button(page, "Workspace details")).toBeVisible();
  }
});

test("pending and indeterminate registration cannot replay or assume creation", async ({ page, request }) => {
  await editor(page); await button(page, "Review").click(); await control(request, "hold", ["configureExisting"]);
  await button(page, "Add stopped").click(); await expect(activeTask(page)).toHaveAttribute("aria-busy", "true");
  await expect(button(page, "Back to edit")).toBeDisabled(); await expect(button(page, "Add stopped")).toBeDisabled();
  await control(request, "settle", ["configureExisting", true]); await expect(page.getByRole("alert")).toContainText("failed");
  expect((await state(request)).model.workspaces.some((w: { path: string }) => w.path === "/synthetic/existing")).toBe(false);
  await control(request, "fail", ["configureExisting", "indeterminate-after"]); await button(page, "Add stopped").click();
  await expect(page.getByRole("alert")).toContainText(/unknown|confirmed/i); await expect(button(page, "Add stopped")).toBeDisabled();
  await expect(button(page, "Check current Hub state")).toBeVisible();
  expect((await state(request)).model.workspaces.filter((w: { path: string }) => w.path === "/synthetic/existing")).toHaveLength(1);
  expect(mutations(await state(request)).every(r => r.method === "configureExisting")).toBe(true);
});

test("registration failure retains selected folder recovery without fabricated Start", async ({ page, request }) => {
  await control(request, "setOnboardingFault", ["register-failed"]); await editor(page); await button(page, "Review").click();
  await button(page, "Add stopped").click(); await expect(page.locator(".mh-flow-page h1")).toHaveText("Configuration needs attention");
  await expect(page.locator(".mh-flow-page")).toContainText("/synthetic/existing");
  await expect(button(page, "Inspect retained folder")).toBeVisible(); await expect(button(page, "Start workspace")).toHaveCount(0);
});

test("outcome read failure offers read-only Retry, not a guessed Open or repeated registration", async ({ page, request }) => {
  await editor(page); await button(page, "Review").click();
  await control(request, "fail", ["readWorkspace", { kind: "unavailable", message: "Synthetic session state unavailable" }]);
  await button(page, "Add stopped").click(); await expect(page.locator(".mh-flow-page h1")).toHaveText("Information unavailable");
  await expect(button(page, "Retry")).toBeVisible(); await expect(button(page, "Start workspace")).toHaveCount(0);
  await expect(button(page, "Open workspace")).toHaveCount(0);
  await control(request, "fail", ["readWorkspace", null]); await button(page, "Retry").click();
  await expect(button(page, "Start workspace")).toBeVisible();
  expect(mutations(await state(request)).map(r => r.method)).toEqual(["configureExisting"]);
});

test("cancel and expired browser Forward cannot restore or replay a registration draft", async ({ page, request }) => {
  await editor(page); await page.getByLabel("Workspace display name", { exact: true }).fill("Private draft identity");
  await button(page, "Cancel").click(); await expect(button(page, "Existing folder")).toBeVisible();
  await page.goForward(); await expect(button(page, "Existing folder")).toBeVisible();
  await expect(page.getByLabel("Workspace display name", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain("Private draft identity");
  expect(mutations(await state(request))).toHaveLength(0);
});

test("existing-folder visual batch: required sizes, both themes, editor optional review outcome", async ({ page, request }, info) => {
  test.skip(!process.env.UATU_EXISTING_EVIDENCE || info.project.name !== "chromium", "One explicit visual batch");
  const geometry: unknown[] = [];
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]]) for (const colorScheme of ["light", "dark"] as const) {
    await request.post("/review/reset", { data: { scenario: "mixed" } });
    await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const capture = async (stage: string, pane: string) => {
      const scroll = page.locator(pane); await expect(scroll).toBeVisible();
      const dimensions = await scroll.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1); geometry.push({ width, colorScheme, stage, ...dimensions });
      await page.screenshot({ path: `${process.env.UATU_EXISTING_EVIDENCE}/${width}-${colorScheme}-${stage}.png` });
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.screenshot({ path: `${process.env.UATU_EXISTING_EVIDENCE}/${width}-${colorScheme}-${stage}-end.png` });
    };
    await editor(page); await capture("editor", ".mh-sheet-body");
    await page.locator("[data-setup-credentials] > summary").click(); await capture("optional", ".mh-sheet-body");
    await button(page, "Review").click(); await capture("review", ".mh-sheet-body");
    await button(page, "Add stopped").click(); await expect(button(page, "Start workspace")).toBeVisible(); await capture("outcome", ".mh-flow-content");
  }
  await info.attach("existing-folder-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
});
