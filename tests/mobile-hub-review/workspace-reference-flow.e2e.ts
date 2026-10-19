import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { namedButton as button, activeTask } from "./navigation";
import type { ReviewControl, ReviewControlArguments } from "./controller";

async function control<K extends ReviewControl>(request: APIRequestContext, name: K, args: ReviewControlArguments<K>) {
  expect((await request.post(`/review/control/${name}`, { data: args })).ok()).toBe(true);
}
const state = async (request: APIRequestContext) => (await request.get("/review/state")).json();
async function editor(page: Page, folder = "reference-flow") {
  await page.goto("/?detail=add-workspace"); await button(page, "Create workspace").click();
  await page.getByLabel("New folder name", { exact: true }).fill(folder);
  await expect(page.getByLabel("Workspace display name", { exact: true })).toHaveValue(folder);
}
async function review(page: Page, start = false) {
  await page.getByLabel("Create the folder and initialize Git", { exact: true }).check();
  if (start) await page.getByLabel("Start after configuration", { exact: true }).check();
  await button(page, "Review").click();
  await expect(activeTask(page)).toContainText("Exact destination on Hub");
}
test.beforeEach(async ({ request, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await request.post("/review/reset", { data: { scenario: "mixed" } })).ok()).toBe(true);
});

test("optional setup retains manual identity, choices and consent; concealed invalid hosts reopen", async ({ page, request }) => {
  await editor(page);
  const details = page.locator("[data-setup-credentials]");
  const summary = details.locator("summary");
  const init = page.getByLabel("Create the folder and initialize Git", { exact: true });
  const start = page.getByLabel("Start after configuration", { exact: true });
  await expect(details).not.toHaveAttribute("open"); await expect(init).not.toBeChecked(); await expect(start).not.toBeChecked();
  for (const field of [init, start]) expect(await field.evaluate(el => !el.closest("details"))).toBe(true);
  // Complete advisory remains visible before optional controls, not the prototype's footer/disclosure.
  const safety = page.getByRole("region", { name: "Credential safety details", exact: true });
  await expect(safety).toBeVisible(); await expect(safety).toContainText("Do not run untrusted projects");
  expect(await safety.evaluate(el => !el.closest("details") && !!(el.compareDocumentPosition(document.querySelector("[data-setup-credentials]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByLabel("Workspace display name", { exact: true }).fill("My edited identity");
  await page.getByLabel("New folder name", { exact: true }).fill("edited-folder");
  await expect(page.getByLabel("Workspace display name", { exact: true })).toHaveValue("My edited identity");
  await summary.click();
  const auth = page.getByRole("combobox", { name: "Git authentication", exact: true });
  const host = page.getByLabel("Authentication host", { exact: true });
  await auth.selectOption("ssh-open"); await host.fill("github.com");
  await page.getByRole("combobox", { name: "Commit signing", exact: true }).selectOption("pgp-locked");
  await init.check(); await start.check(); await summary.click(); await summary.click();
  await expect(host).toHaveValue("github.com"); await host.fill(""); await summary.click();
  await button(page, "Review").click(); await expect(details).toHaveAttribute("open");
  await expect(host).toHaveAttribute("aria-invalid", "true"); await expect(host).toHaveAccessibleDescription("Enter an authentication host.");
  await host.fill("github.com"); await expect(host).not.toHaveAttribute("aria-invalid");
  await summary.click(); await button(page, "Review").click();
  await expect(activeTask(page)).toContainText("/synthetic/edited-folder"); await expect(activeTask(page)).toContainText("My edited identity");
  await expect(activeTask(page)).toContainText("github.com"); await expect(activeTask(page)).toContainText("Start after configuration explicitly requested");
  await expect(activeTask(page)).toContainText("Folder creation and Git initialization explicitly authorized");
  expect((await state(request)).log.filter((row: { method: string }) => row.method === "createWorkspace")).toHaveLength(0);
  await button(page, "Back to edit").click(); await expect(details).not.toHaveAttribute("open");
  await expect(init).toBeChecked(); await expect(start).toBeChecked(); await summary.click();
  await expect(host).toHaveValue("github.com"); await expect(auth).toHaveValue("ssh-open");
  await expect(page.getByRole("combobox", { name: "Commit signing", exact: true })).toHaveValue("pgp-locked");
  await button(page, "Browse elsewhere").click(); await button(page, "Choose").click();
  await expect(page.getByLabel("Workspace display name", { exact: true })).toHaveValue("My edited identity");
  await expect(details).toHaveAttribute("open"); await expect(init).toBeChecked(); await expect(start).toBeChecked();
  await page.getByLabel("New folder name", { exact: true }).fill("another-folder");
  await expect(page.getByLabel("Workspace display name", { exact: true })).toHaveValue("My edited identity");
});

test("stopped result has explicit guarded Start, not a second create or silent session", async ({ page, request }) => {
  await editor(page); await review(page);
  await expect(activeTask(page)).toContainText("Register stopped; do not start");
  await expect(activeTask(page)).toContainText("None"); await button(page, "Create stopped").click();
  await expect(button(page, "Start workspace")).toBeVisible(); await expect(page.locator(".mh-flow-page")).toContainText("Stopped");
  const before = await state(request);
  expect(before.log.filter((row: { method: string }) => row.method === "startWorkspace")).toHaveLength(0);
  await button(page, "Start workspace").click(); await expect(activeTask(page, "confirmation")).toContainText("Start without credentials?");
  expect((await state(request)).log.filter((row: { method: string }) => row.method === "startWorkspace")).toHaveLength(0);
  await button(page, "Cancel").click(); await button(page, "Start workspace").click(); await button(page, "Start").click();
  await expect.poll(async () => (await state(request)).model.workspaces.find((w: { path: string }) => w.path === "/synthetic/reference-flow").runtime.status).toBe("running");
  expect((await state(request)).log.filter((row: { method: string }) => row.method === "createWorkspace")).toHaveLength(1);
});

test("assigned locked signing key uses existing unlock fence on outcome Start", async ({ page, request }) => {
  await editor(page); await page.locator("[data-setup-credentials] > summary").click();
  await page.getByRole("combobox", { name: "Commit signing", exact: true }).selectOption("pgp-locked");
  await review(page); await button(page, "Create stopped").click(); await button(page, "Start workspace").click();
  await expect(activeTask(page)).toContainText("Unlock workspace credential");
  await expect(page.locator('input[type="password"]')).toBeVisible();
  expect((await state(request)).model.workspaces.find((w: { path: string }) => w.path === "/synthetic/reference-flow").runtime.status).toBe("stopped");
});

test("requested start success offers Open; failed start truthfully offers guarded Start", async ({ page, request }) => {
  for (const failed of [false, true]) {
    await request.post("/review/reset", { data: { scenario: "mixed" } });
    if (failed) await control(request, "setOnboardingFault", ["start-failed"]);
    await editor(page); await review(page, true); await button(page, "Create and start").click();
    await expect(button(page, failed ? "Start workspace" : "Open workspace")).toBeVisible();
    await expect(page.locator(".mh-flow-page")).toContainText(failed ? "Stopped" : "Running");
    if (failed) await expect(page.locator(".mh-flow-page")).toContainText("Start failed:");
    await expect(button(page, "Workspace details")).toBeVisible();
  }
});

test("pending, rejected and unknown creation retain single-dispatch/reconcile guards", async ({ page, request }) => {
  await editor(page); await review(page); await control(request, "hold", ["createWorkspace"]);
  await button(page, "Create stopped").click(); await expect(activeTask(page)).toHaveAttribute("aria-busy", "true");
  await expect(button(page, "Back to edit")).toBeDisabled(); await expect(button(page, "Create stopped")).toBeDisabled();
  await control(request, "settle", ["createWorkspace", true]); await expect(page.getByRole("alert")).toContainText("failed");
  expect((await state(request)).model.workspaces.some((w: { path: string }) => w.path === "/synthetic/reference-flow")).toBe(false);
  await control(request, "fail", ["createWorkspace", "indeterminate-after"]);
  await button(page, "Create stopped").click(); await expect(page.getByRole("alert")).toContainText(/unknown|confirmed/i);
  await expect(button(page, "Create stopped")).toBeDisabled();
  await expect(button(page, "Check current Hub state")).toBeVisible();
  expect((await state(request)).model.workspaces.filter((w: { path: string }) => w.path === "/synthetic/reference-flow")).toHaveLength(1);
});

test("partial failure exposes retained folder recovery, never a fabricated success Start", async ({ page, request }) => {
  await control(request, "setOnboardingFault", ["register-failed"]);
  await editor(page); await review(page); await button(page, "Create stopped").click();
  await expect(page.locator(".mh-flow-page h1")).toHaveText("Configuration needs attention");
  await expect(page.locator(".mh-flow-page")).toContainText("/synthetic/reference-flow");
  await expect(button(page, "Inspect retained folder")).toBeVisible(); await expect(button(page, "Start workspace")).toHaveCount(0);
});

test("reference flow visual batch: required sizes, both themes and all four stages", async ({ page, request }, info) => {
  test.skip(!process.env.UATU_REFERENCE_EVIDENCE || info.project.name !== "chromium", "One explicit batched visual round only");
  const geometry: unknown[] = [];
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]]) for (const colorScheme of ["light", "dark"] as const) {
    await request.post("/review/reset", { data: { scenario: "mixed" } });
    await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const capture = async (stage: string, pane: string) => {
      const scroll = page.locator(pane); await expect(scroll).toBeVisible();
      const dimensions = await scroll.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      geometry.push({ width, colorScheme, stage, ...dimensions });
      await page.screenshot({ path: `${process.env.UATU_REFERENCE_EVIDENCE}/${width}-${colorScheme}-${stage}.png` });
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.screenshot({ path: `${process.env.UATU_REFERENCE_EVIDENCE}/${width}-${colorScheme}-${stage}-end.png` });
    };
    await page.goto("/"); await expect(page.locator('[data-action="open:atlas"]')).toHaveText("Open");
    await expect(page.locator('[data-action="start:notes"]')).toHaveText("Start"); await capture("hub", ".mh-page");
    await editor(page); await capture("editor", ".mh-sheet-body");
    await page.locator("[data-setup-credentials] > summary").click(); await capture("optional", ".mh-sheet-body");
    await review(page); await capture("review", ".mh-sheet-body");
    await button(page, "Create stopped").click(); await expect(button(page, "Start workspace")).toBeVisible(); await capture("outcome", ".mh-flow-content");
  }
  await info.attach("reference-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
});
