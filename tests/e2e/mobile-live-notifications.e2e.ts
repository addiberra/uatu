import { createECDH, randomBytes } from "node:crypto";
import { test, expect } from "./hub-fixtures";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, hubWorkspaces: ["phone-notifications"] });

test("phone notification permission/enrollment/disable remains device-scoped with exactly two dock destinations", async ({ hubContext }) => {
  const key = createECDH("prime256v1"); key.generateKeys();
  const subscription = { endpoint: "https://web.push.apple.com/mobile-browser-fixture", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  test.info().annotations.push({ type: "simulation", description: "Platform permission and PushManager are doubles; production frontend and real Hub enrollment, no OS push delivery." });
  await hubContext.addInitScript(value => {
    let subscribed = false, prompts = 0;
    const subscription = { toJSON: () => value, unsubscribe: async () => { subscribed = false; return true; } };
    const registration = { active: {}, pushManager: { getSubscription: async () => subscribed ? subscription : null, subscribe: async () => { subscribed = true; return subscription; } } };
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission: async () => { prompts++; (window as any).Notification.permission = "granted"; return "granted"; } } });
    Object.defineProperty(window, "PushManager", { configurable: true, value: function() {} });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => [], register: async () => registration, getRegistration: async () => registration } });
    (window as any).notificationCounts = () => ({ prompts, subscribed });
  }, subscription);
  const page = await hubContext.newPage(); await page.goto("/settings?detail=notifications");
  await expect(page.getByRole("button", { name: "Enable notifications", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).notificationCounts())).toEqual({ prompts: 0, subscribed: false });
  await page.getByRole("checkbox", { name: "All workspaces, including ones added later" }).check();
  await expect(page.getByRole("checkbox", { name: "phone-notifications", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Enable notifications", exact: true }).click();
  await expect(page.locator(".mh-notifications [role=status]")).toContainText("saved");
  expect(await page.evaluate(() => (window as any).notificationCounts())).toEqual({ prompts: 1, subscribed: true });
  const device = await page.evaluate(() => localStorage.getItem("uatu:push-device")); expect(device).toBeTruthy();
  const state = await (await hubContext.request.get(`/api/hub/notifications?device=${device}`)).json();
  expect(state.device).toMatchObject({ allWorkspaces: true, active: true });
  await page.getByRole("button", { name: "Disable on this device", exact: true }).click();
  await expect(page.locator(".mh-notifications [role=status]")).toContainText("disabled");
  expect(await page.evaluate(() => localStorage.getItem("uatu:push-device"))).toBeNull();
  await expect(page.locator(".mh-dock .mh-tab")).toHaveCount(2);
});

for (const state of ["denied", "unsupported", "insecure"] as const) test(`phone notifications explain ${state} without requesting permission`, async ({ hubContext }) => {
  await hubContext.addInitScript(state => {
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: state === "denied" ? "denied" : "default", requestPermission: () => { throw new Error("Unexpected permission prompt"); } } });
    if (state === "denied") Object.defineProperty(window, "PushManager", { configurable: true, value: function() {} });
    if (state === "unsupported") Reflect.deleteProperty(window, "PushManager");
    if (state === "insecure") Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  }, state);
  const page = await hubContext.newPage(); await page.goto("/settings?detail=notifications");
  await expect(page.getByRole("button", { name: "Enable notifications", exact: true })).toBeDisabled();
  await expect(page.locator(".mh-notifications [role=status]")).toContainText(state === "denied" ? "blocked" : state === "unsupported" ? "Home Screen" : "HTTPS");
  await expect(page.locator(".mh-dock .mh-tab")).toHaveCount(2);
});
