import { test, expect, signIn } from "./hub-fixtures";
import { chromium, webkit } from "@playwright/test";
import { captureScreenshot } from "./evidence";

test("personal chat preference saves across device pages and refreshes on focus", async ({ hubContext, hub }, testInfo) => {
  const a = await hubContext.newPage();
  const b = await hubContext.newPage();
  await Promise.all([a.goto(`${hub.origin}/settings`), b.goto(`${hub.origin}/settings`)]);
  const toggleA = a.getByLabel("Automatically background blocking work when steering");
  const toggleB = b.getByLabel("Automatically background blocking work when steering");
  await expect(toggleA).toBeEnabled();
  await expect(toggleB).toBeChecked();
  await toggleA.uncheck();
  await a.getByRole("button", { name: "Save chat preference", exact: true }).click();
  await expect(a.locator("#personal-chat-preferences-status")).toContainText("Saved: OFF");
  await b.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(toggleB).not.toBeChecked();
  await b.reload();
  await expect(toggleB).not.toBeChecked();
  await expect(b.locator("#personal-chat-preferences-pane")).toContainText("including shell commands");
  await captureScreenshot(b, testInfo, "personal-chat-preferences-off");
});

test("stale personal save reports current own-account state and unavailable does not claim saved", async ({ hubContext, hub }) => {
  const a = await hubContext.newPage();
  const b = await hubContext.newPage();
  await Promise.all([a.goto(`${hub.origin}/settings`), b.goto(`${hub.origin}/settings`)]);
  await expect(a.getByLabel("Automatically background blocking work when steering")).toBeEnabled();
  await expect(b.getByLabel("Automatically background blocking work when steering")).toBeEnabled();
  await a.getByLabel("Automatically background blocking work when steering").uncheck();
  await a.getByRole("button", { name: "Save chat preference", exact: true }).click();
  await expect(a.locator("#personal-chat-preferences-status")).toContainText("Saved: OFF");
  // No focus invalidation: the second device is intentionally stale.
  await b.evaluate(() => (document.querySelector("#personal-chat-preferences-form") as HTMLFormElement).requestSubmit());
  await expect(b.locator("#personal-chat-preferences-error")).toContainText("another device");
  await expect(b.getByLabel("Automatically background blocking work when steering")).not.toBeChecked();
  await b.route("**/api/hub/settings/chat-preferences", route => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await b.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(b.getByLabel("Automatically background blocking work when steering")).toBeDisabled();
  await expect(b.locator("#personal-chat-preferences-error")).toContainText("unavailable");
});

for (const browserName of ["chromium", "webkit"] as const) test.describe(`${browserName} personal chat touch navigation`, () => {
  test("workspace Settings link survives menu dismissal and offers keyboard and 44px touch controls", async ({ hub }, info) => {
    const browser = await ({ chromium, webkit })[browserName].launch();
    try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signIn(page, hub);
    await page.goto(`${hub.origin}/s/${hub.workspaces[0].id}/`);
    await page.getByRole("tab", { name: "Files", exact: true }).tap();
    const toggle = page.locator("#hub-toggle");
    await toggle.tap();
    const settings = page.locator('#hub-menu a[href="/settings#personal-chat-preferences-pane"]');
    await expect(settings).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await toggle.tap();
    await settings.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${hub.origin}/settings#personal-chat-preferences-pane`);
    const input = page.getByLabel("Automatically background blocking work when steering");
    await expect(input).toBeEnabled();
    const save = page.getByRole("button", { name: "Save chat preference", exact: true });
    for (const control of [input, save]) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await input.tap();
    await save.tap();
    await expect(page.locator("#personal-chat-preferences-status")).toContainText("Saved: OFF");
    await captureScreenshot(page, info, `personal-chat-${browserName}-touch`);
    } finally { await browser.close(); }
  });
});
