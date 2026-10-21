import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./hub-fixtures";
import { captureScreenshot, saveEvidence } from "./evidence";

test.use({ hubWorktrees: true, hubWorkspaces: ["nav-bounds"] });

async function withinViewport(page: Page, locator: Locator, inset = 0) {
  const viewport = await page.evaluate(() => ({ width: visualViewport!.width, height: visualViewport!.height }));
  const box = (await locator.boundingBox())!;
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(inset);
  expect(box.y).toBeGreaterThanOrEqual(inset);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - inset);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - inset);
}

for (const width of [320, 390, 1440]) test.describe(`Hub navigation at ${width}px`, () => {
  test.use({ viewport: { width, height: width === 320 ? 568 : 900 }, isMobile: width < 600, hasTouch: width < 600 });
  test("notifications, navigation and worktree dialogs fit the visible viewport", async ({ hub, hubContext }, info) => {
    const page = await hubContext.newPage();
    await page.goto(hub.origin);
    if (width < 600) {
      const controlsFit = async (region: Locator) => {
        for (const control of await region.locator("button:visible, input:visible, select:visible").all()) {
          await control.scrollIntoViewIfNeeded();
          await withinViewport(page, control);
          expect(await control.evaluate(node => { const box = node.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return hit !== null && (node === hit || node.contains(hit)); })).toBe(true);
        }
      };
      const nav = page.locator(".mh-dock");
      for (const button of await nav.getByRole("button").all()) {
        await withinViewport(page, button);
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await captureScreenshot(page, info, `hub-nav-${width}`);
      await page.locator('[data-action="settings"]').click();
      await page.locator('[data-action="notifications"]').click();
      await expect(page.locator(".mh-notifications")).toBeVisible();
      await withinViewport(page, page.locator(".mh-flow-page"));
      await controlsFit(page.locator(".mh-flow-page"));
      await page.locator('[data-action="settings"]').click();
      await page.locator('[data-action="auto-hide"]').click();
      await controlsFit(page.locator(".mh-sheet"));
      await page.locator(".mh-sheet").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.locator('[data-action="hub"]').click();
      await page.locator('[data-action="info:nav-bounds"]').click();
      await page.locator('[data-flow="worktrees"]').click();
      await page.getByRole("button", { name: "Create branch or worktree", exact: true }).click();
      await page.getByLabel("New branch name", { exact: true }).fill(`bounds-${width}`);
      await withinViewport(page, page.locator(".mh-sheet"));
      await controlsFit(page.locator(".mh-sheet"));
      await captureScreenshot(page, info, `hub-create-${width}`);
      await page.getByRole("button", { name: "Create worktree", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Refresh checkouts", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`^bounds-${width},`) }).click();
      await page.getByRole("button", { name: "Check deletion safety", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete worktree?", exact: true })).toBeVisible();
      await withinViewport(page, page.locator(".mh-sheet"), 8);
      await controlsFit(page.locator(".mh-sheet"));
      await captureScreenshot(page, info, `hub-delete-${width}`);
      await page.locator(".mh-sheet").getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.locator(".mh-sheet")).toHaveCount(0);
      const result = await (await page.request.get("/api/hub/worktrees?source=nav-bounds")).json();
      expect(result.inventory.checkouts.some((checkout: { branch: string }) => checkout.branch === `bounds-${width}`)).toBe(true);
      await page.close();
      return;
    }
    const nav = page.getByRole("navigation", { name: "Hub", exact: true });
    await expect(nav.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, visibleWidth: visualViewport!.width }));
    await saveEvidence(info, "bounds.json", JSON.stringify(metrics, null, 2));
    await captureScreenshot(page, info, `hub-nav-${width}`);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.visibleWidth).toBe(width);
    for (const control of await nav.locator("a, button").all()) {
      await withinViewport(page, control);
      if (width < 600) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if (width === 1440) {
      const tops = await nav.locator("a, button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(10);
    }

    await page.getByRole("button", { name: "Add worktree to nav-bounds", exact: true }).click();
    await page.getByRole("menuitem", { name: "New branch / worktree", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill(`bounds-${width}`);
    // Keep a visible gutter for the dialog shadow as well as its border.
    await withinViewport(page, dialog, 8);
    for (const control of await dialog.locator("button:visible, input:visible").all()) await withinViewport(page, control);
    await captureScreenshot(page, info, `hub-create-${width}`);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-worktree-confirmation]")).toContainText(`Created bounds-${width}`);
    const row = page.locator(".row[data-workspace]", { hasText: `bounds-${width}` });
    await expect(row).toBeAttached();
    for (const disclosure of await page.locator("[data-disclosure]:not([open])").all()) await disclosure.locator(":scope > summary").click();
    await row.getByRole("button", { name: "Delete worktree", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await withinViewport(page, dialog, 8);
    for (const control of await dialog.locator("button:visible, input:visible").all()) await withinViewport(page, control);
    await captureScreenshot(page, info, `hub-delete-${width}`);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.close();
  });
});
