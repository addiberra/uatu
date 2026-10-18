import { expect, test } from "@playwright/test";
import { activeTask } from "./navigation";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/review/reset", { data: { scenario: "mixed" } })).ok()).toBe(true);
});

test("browser Back/Forward preserves the catalog parent of Add Credential without changing direct-entry Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/settings");
  const overview = page.locator(".mh-page"), flow = page.locator(".mh-flow-page");
  await overview.locator('[data-action="repository-credentials"]').waitFor();
  await overview.evaluate(el => { el.scrollTop = 120; });
  const top = await overview.evaluate(el => el.scrollTop);
  await overview.locator('[data-action="repository-credentials"]').click();
  await flow.locator('[data-action="add-credential"]').click();
  await expect(flow.getByRole("heading", { name: "Add Credential", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.state.mobileHub.parent)).toBe("repository-credentials");
  await page.goBack();
  await expect(flow.getByRole("heading", { name: "Repository credentials", exact: true })).toBeVisible();
  await page.goForward();
  await expect(flow.getByRole("heading", { name: "Add Credential", exact: true })).toBeVisible();
  await flow.getByRole("button", { name: "Back", exact: true }).click();
  await expect(flow.getByRole("heading", { name: "Repository credentials", exact: true })).toBeVisible();
  await flow.getByRole("button", { name: "Back", exact: true }).click();
  await expect(flow).toBeHidden();
  expect(await overview.evaluate(el => el.scrollTop)).toBe(top);
  await page.goto("/settings?detail=add-credential");
  await expect(flow.getByRole("heading", { name: "Add Credential", exact: true })).toBeVisible();
  await flow.getByRole("button", { name: "Back", exact: true }).click();
  await expect(flow).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
});

test("one counted destination, direct agent accounts, contextual and browser Back retain Settings scroll", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/settings");
  const overview = page.locator(".mh-page"), catalog = page.locator(".mh-flow-page");
  const snapshot = await (await request.get("/review/state")).json();
  await expect(overview.locator('[data-action="repository-credentials"] .mh-value')).toHaveText(String(snapshot.model.credentials.length));
  await expect(overview.locator('[data-credential-id], [data-action="add-credential"], [data-shared-uid]')).toHaveCount(0);
  await expect(overview.locator('[data-action="agent-accounts"]')).toHaveCount(1);
  await overview.evaluate(el => { el.scrollTop = 120; });
  const top = await overview.evaluate(el => el.scrollTop);
  await overview.locator('[data-action="repository-credentials"]').click();
  await expect(catalog.getByRole("heading", { name: "Repository credentials", exact: true })).toBeVisible();
  await expect(catalog.locator("[data-credential-id]")).toHaveCount(snapshot.model.credentials.length);
  await expect(catalog.locator('[data-credential-id="ssh-locked"] .mh-value')).toHaveText("Locked");
  await expect(catalog.locator('[data-action="add-credential"], [data-action="tools"], [data-action="assignments"]')).toHaveCount(3);
  await catalog.locator(".mh-safety-disclosure summary").click();
  await expect(catalog).toContainText("same-UID processes can inspect runtime files");
  await catalog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(catalog).toBeHidden();
  expect(await overview.evaluate(el => el.scrollTop)).toBe(top);
  await page.goBack(); // Returns to the catalog history entry.
  await expect(catalog).toBeVisible();
  await page.goBack();
  await expect(catalog).toBeHidden();
  expect(await overview.evaluate(el => el.scrollTop)).toBe(top);
  await page.goForward();
  await expect(catalog.getByRole("heading", { name: "Repository credentials", exact: true })).toBeVisible();
  await catalog.locator('[data-action="tools"]').click();
  await catalog.locator('[data-flow="tool-git"]').click();
  await catalog.getByRole("button", { name: /Executable location/ }).click();
  const editor = activeTask(page);
  await editor.getByLabel("Absolute executable path").fill("/synthetic/draft-only");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await catalog.getByRole("button", { name: /Executable location/ }).click();
  await expect(activeTask(page).getByLabel("Absolute executable path")).not.toHaveValue("/synthetic/draft-only");
  await activeTask(page).getByRole("button", { name: "Cancel", exact: true }).click();
});

test("credential loading and errors stay local; Retry refreshes status and a verified empty catalog still permits Add", async ({ page, request }) => {
  await request.post("/review/control/hold", { data: ["readCredentials"] });
  try {
    await page.goto("/settings");
    await expect(page.locator('[data-action="default-folder"]')).toBeVisible();
    await expect(page.locator('[data-action="repository-credentials"] .mh-value')).toHaveText("");
    await page.locator('[data-action="repository-credentials"]').click();
    const catalog = page.locator(".mh-flow-page");
    await expect(catalog).toContainText("Loading credentials…");
    await expect(catalog.locator('[data-action="tools"]')).toBeVisible();
    await request.post("/review/control/settle", { data: ["readCredentials", true] });
    await expect(catalog.locator("[data-credential-catalog] [role=alert]")).not.toBeEmpty();
    await request.post("/review/control/fail", { data: ["readCredentials", null] });
    await catalog.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(catalog.locator('[data-credential-id="ssh-locked"] .mh-value')).toHaveText("Locked");
    await request.post("/review/control/setKeyState", { data: ["ssh-locked", "unlocked"] });
    await expect(catalog.locator('[data-credential-id="ssh-locked"] .mh-value')).toHaveText("Unlocked");
    await request.post("/review/reset", { data: { scenario: "empty" } });
    await page.goto("/settings?detail=repository-credentials");
    await expect(catalog).toContainText("No credentials yet. Add one for Git authentication or commit signing.");
    await catalog.locator('[data-action="add-credential"]').click();
    await expect(catalog.getByRole("heading", { name: "Add Credential", exact: true })).toBeVisible();
    await catalog.getByRole("button", { name: "Back", exact: true }).click();
    await expect(catalog.getByRole("heading", { name: "Repository credentials", exact: true })).toBeVisible();
  } finally { await request.post("/review/control/settle", { data: ["readCredentials", false] }); }
});
