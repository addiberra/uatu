import { test, expect, loginHub, hubPost } from "./hub-mobile-fixtures";
import { openNavigation } from "./navigation-helpers";
import type { Page } from "@playwright/test";

async function residentHub(page: Page) {
  await openNavigation(page);
  await page.locator("#navigation-hub").click();
  await expect(page.locator(".mh-page main > h1")).toHaveText("Workspaces");
}
async function signOut(page: Page) {
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="security"]').click();
  await page.locator('[data-flow="signout"]').click();
  await page.locator(".mh-sheet").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("resident Return preserves identity; fresh and copied tabs have no Return; Stop and sign-out revoke residency", async ({ page, context, hub }) => {
  test.setTimeout(180_000);
  await loginHub(page, hub);
  await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  const ids: string[] = [];
  for (const folder of Object.values(hub.workspaces)) {
    const result = await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: folder, displayName: "Shared", start: false });
    ids.push(result.workspace.id);
  }
  const [a, b] = ids as [string, string];
  await page.reload();
  const start = page.locator(`[data-action="start:${a}"]`);
  await start.click();
  await expect(page.locator(".mh-sheet")).toContainText("Start without credentials?");
  await page.locator(".mh-sheet").getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await (await page.request.get(`${hub.origin}/api/hub/state`)).json()).workspaces.every((w: { running: boolean }) => !w.running)).toBe(true);
  const opening = page.waitForRequest(request => request.isNavigationRequest()
    && request.url() === `${hub.origin}/s/${a}/`);
  await start.click();
  await page.locator(".mh-sheet").getByRole("button", { name: "Start", exact: true }).click();
  await opening;
  await expect(page.locator("#hub-control")).not.toHaveAttribute("hidden");
  // Root startup may select the newest document asynchronously. Establish an
  // exact reading destination before recording the visit and leaving it.
  const destination = `${hub.origin}/s/${a}/docs/guide.md`;
  await page.goto(destination);
  await expect(page.locator("#preview")).toContainText("Guide A");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("uatu.hub.return.v1") || "null")?.workspaceId)).toBe(a);
  const resident = await page.locator("#mobile-workspace-root").elementHandle();
  await residentHub(page);
  await expect(page.locator('[data-action="return"]')).toHaveAccessibleName(`Return to Shared, ${hub.workspaces.a}`);
  // A new tab without an opener shares authentication, not sessionStorage.
  const fresh = await context.newPage();
  await fresh.goto(hub.origin);
  await expect(fresh.locator('[data-action="return"]')).toHaveCount(0);
  await fresh.close();
  const popupPromise = page.waitForEvent("popup");
  await page.evaluate(() => window.open("/settings", "_blank"));
  const inherited = await popupPromise;
  await expect(inherited.locator('[data-action="return"]')).toHaveCount(0);
  await inherited.close();
  await page.locator(`[data-action="info:${b}"]`).click();
  await page.locator('[data-flow="rename"]').click();
  await page.getByLabel("Display name", { exact: true }).fill("Managed B");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".mh-flow-page h1")).toHaveText("Managed B");
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator('[data-action="return"]')).toHaveAccessibleName(`Return to Shared, ${hub.workspaces.a}`);
  await hubPost(page.request, hub, `/api/hub/workspaces/${a}/display-name`, { displayName: "Renamed A" });
  // Return revalidates the resident identity; re-entering Hub uses its current
  // metadata rather than relying on the old desktop page's polling timer.
  await page.locator('[data-action="return"]').click();
  await residentHub(page);
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator('[data-action="return"]')).toContainText("Renamed A");
  await page.locator('[data-action="return"]').click();
  await expect(page).toHaveURL(destination);
  expect(await resident!.evaluate(node => node === document.querySelector("#mobile-workspace-root"))).toBe(true);
  await residentHub(page);
  await hubPost(page.request, hub, `/api/hub/sessions/${a}/stop`);
  await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("data-access-invalidated", "");
  await expect(page.locator('[data-action="return"]')).toBeDisabled();
  await expect(page.locator("#mobile-workspace-root")).toHaveAttribute("inert", "");
  await hubPost(page.request, hub, `/api/hub/workspaces/${a}/forget`);
  await expect(page.locator('[data-action="return"]')).toBeDisabled();
  await page.goto(hub.origin);
  await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  await signOut(page);
  expect((await page.request.get(`${hub.origin}/api/hub/state`)).status()).toBe(401);
  expect(await page.evaluate(() => sessionStorage.getItem("uatu.hub.return.v1"))).toBeNull();
});

for (const touch of [true, false]) {
test.describe(touch ? "touch history recovery" : "desktop history recovery", () => {
test.use({ hasTouch: touch, isMobile: touch, viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
for (const outcome of ["stopped", "removed", "signed out"] as const) {
test(`Forward after interrupted workspace boot recovers a ${outcome} target`, async ({ page, hub }) => {
  test.setTimeout(60_000);
  await loginHub(page, hub);
  const a = (await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "A", start: true })).workspace.id;
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() === "POST") mutations.push(new URL(request.url()).pathname); });
  // Do not install Playwright routing: that disables HTTP caching and would
  // hide the original regression. Leave before waiting for workspace boot.
  const entry = await page.goto(`${hub.origin}/s/${a}/docs/guide.md`, { waitUntil: "commit" });
  expect(entry!.headers()["cache-control"]).toBe("no-store");
  await page.goBack();
  await expect(page).toHaveURL(`${hub.origin}/`);
  if (outcome === "signed out") {
    const logout = await page.request.post(`${hub.origin}/logout`, { headers: { origin: hub.origin } });
    expect(logout.ok()).toBe(true);
  } else {
    await hubPost(page.request, hub, `/api/hub/sessions/${a}/stop`);
    if (outcome === "removed") await hubPost(page.request, hub, `/api/hub/workspaces/${a}/forget`);
  }
  await page.goForward();
  if (outcome === "signed out") {
    await expect(page).toHaveURL(new RegExp(`/login\\?next=`));
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Guide A");
  } else {
    await expect(page).toHaveURL(`${hub.origin}/s/${a}/docs/guide.md`);
    await expect(page.getByText(outcome === "stopped" ? /not running/ : /No workspace/)).toBeVisible();
    const state = (await (await page.request.get(`${hub.origin}/api/hub/state`)).json()).workspaces;
    expect(outcome === "stopped" ? state[0].running : state.length).toBe(outcome === "stopped" ? false : 0);
  }
  expect(mutations).toEqual([]);
});
}
});
}

test.describe("bundle-independent recovery", () => {
  test.use({ javaScriptEnabled: false });
  test("history consults the authenticated Hub even if workspace scripts never execute", async ({ page, hub }) => {
    await loginHub(page, hub);
    const a = (await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "A", start: true })).workspace.id;
    await page.goto(`${hub.origin}/s/${a}/`);
    await page.goBack();
    await hubPost(page.request, hub, `/api/hub/sessions/${a}/stop`);
    await page.goForward();
    await expect(page.getByText(/not running/)).toBeVisible();
  });
});

test("Hub history restores scroll and the same resident workspace without manufacturing a historical Return", async ({ page, hub }) => {
  test.setTimeout(60_000);
  await loginHub(page, hub);
  const a = (await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "A", start: true })).workspace.id;
  await page.goto(`${hub.origin}/s/${a}/docs/guide.md`);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("uatu.hub.return.v1"))).not.toBeNull();
  const resident = await page.locator("#mobile-workspace-root").elementHandle();
  await residentHub(page);
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator('[data-action="return"]')).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator('[data-action="return"]')).toBeEnabled();
  // Ensure a scrollable test surface independently of how many Settings rows
  // this installation has; do not mistake window scroll for the Hub scroller.
  await page.addStyleTag({ content: ".mh-page main { min-height: 1500px; }" });
  await page.locator(".mh-page").evaluate(node => { node.scrollTop = 200; });
  await expect.poll(() => page.locator(".mh-page").evaluate(node => node.scrollTop)).toBe(200);
  await page.locator('[data-action="hub"]').click();
  await expect(page).toHaveURL(`${hub.origin}/`);
  await page.goBack();
  await expect(page).toHaveURL(`${hub.origin}/settings`);
  await expect.poll(() => page.locator(".mh-page").evaluate(node => node.scrollTop)).toBe(200);
  await page.locator('[data-action="return"]').click();
  await expect(page).toHaveURL(`${hub.origin}/s/${a}/docs/guide.md`);
  expect(await resident!.evaluate(node => node === document.querySelector("#mobile-workspace-root"))).toBe(true);
  await page.goto(`${hub.origin}/settings`);
  await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("uatu.hub.return.v1")!).workspaceId)).toBe(a);
});

test("a hanging workspace-switcher read cannot disable resident Return or restore an old login", async ({ page, hub }) => {
  test.setTimeout(120_000);
  await loginHub(page, hub);
  const result = await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "A", start: true });
  await page.goto(`${hub.origin}/s/${result.workspace.id}/`);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("uatu.hub.return.v1"))).not.toBeNull();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route("**/api/hub/sessions", async route => {
    reads++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto(`${hub.origin}/s/${result.workspace.id}/docs/guide.md`);
  await expect(page.locator("#preview")).toContainText("Guide A");
  await expect(page.locator("#hub-control")).not.toHaveAttribute("hidden");
  await expect(page.getByRole("navigation", { name: "Workspace navigation", exact: true })).toBeVisible();
  await residentHub(page);
  await expect(page.locator('.mh-workspace[data-workspace]')).toContainText("A");
  await expect(page.locator('[data-action="add-workspace"]')).toBeEnabled();
  await expect(page.locator('[data-action="return"]')).toBeEnabled();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await signOut(page);
  release();
  await page.unroute("**/api/hub/sessions");
  await loginHub(page, hub);
  await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("uatu.hub.return.v1"))).toBeNull();
});

test("fresh Hub entry has no historical Return and guarded Start masks credentials and refuses disabled assignments", async ({ page, hub }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  await loginHub(page, hub);
  const post = <T>(route: string, data?: unknown) => hubPost<T>(page.request, hub, route, data);
  const a = (await post<{ workspace: { id: string } }>("/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "A", start: true })).workspace.id;
  await page.goto(`${hub.origin}/s/${a}/`);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("uatu.hub.return.v1"))).not.toBeNull();
  await post(`/api/hub/sessions/${a}/stop`);
  const key = (await post<{ credential: { id: string } }>("/api/hub/credentials/ssh/generate", { name: "Return identity", capabilities: ["ssh-authentication"], passphrase: "test-passphrase" })).credential;
  await post(`/api/hub/workspaces/${a}/credential-assignments`, { authentication: { credentialId: key.id, host: "github.com" } });
  await page.goto(`${hub.origin}/settings`);
  await expect(page.locator('[data-action="return"]')).toHaveCount(0);
  await page.locator('[data-action="hub"]').click();
  let starts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(`/${a}/start`)) starts++; });
  await page.locator(`[data-action="start:${a}"]`).click();
  const unlock = page.locator(".mh-sheet");
  await expect(unlock).toContainText("Unlock workspace credential");
  await expect(unlock.locator("input[data-secret]")).toHaveAttribute("type", "password");
  await unlock.locator("input[data-secret]").fill("wrong-passphrase");
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(unlock.locator(".mh-sheet-error")).toBeVisible({ timeout: 30_000 });
  await expect(unlock.locator("input[data-secret]")).toHaveValue("");
  await unlock.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(starts).toBe(0);
  await post(`/api/hub/credentials/${key.id}/disable`);
  await page.locator(`[data-action="start:${a}"]`).click();
  await expect(unlock).toContainText("missing or disabled");
  expect(starts).toBe(0);
  expect((await (await page.request.get(`${hub.origin}/api/hub/state`)).json()).workspaces[0].running).toBe(false);
  await unlock.getByRole("button", { name: "Back", exact: true }).click();
  await post(`/api/hub/credentials/${key.id}/enable`);
  await page.locator(`[data-action="start:${a}"]`).click();
  await unlock.locator("input[data-secret]").fill("test-passphrase");
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page).toHaveURL(`${hub.origin}/s/${a}/`);
  expect(starts).toBe(1);
});

test("real long-path rows retain loading, failure and slow-opening feedback", async ({ page, hub }) => {
  test.setTimeout(90_000);
  await loginHub(page, hub);
  await expect(page.locator(".mh-page")).toContainText("No workspaces yet");
  await expect(page.locator('[data-action="add-workspace"]')).toBeEnabled();
  const folderName = "long-workspace-path-".repeat(10);
  await hubPost(page.request, hub, "/api/hub/folders/create", { parent: hub.root, name: folderName });
  const longPath = (await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: `${hub.root}/${folderName}`, displayName: "Long path", init: true })).workspace;
  const workspace = (await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "Opening target" })).workspace;
  let releaseState!: () => void;
  const stateGate = new Promise<void>(resolve => { releaseState = resolve; });
  let failState = false;
  await page.route("**/api/hub/state", async route => {
    if (failState) { await route.fulfill({ status: 503, json: { error: "Test refresh failure" } }); return; }
    const response = await route.fetch();
    await stateGate;
    await route.fulfill({ response });
  });
  await page.reload();
  await expect(page.locator(".mh-page")).toContainText("Connecting to hub");
  releaseState();
  await expect(page.locator(`[data-workspace="${longPath.id}"] .mh-workspace-copy p`)).toHaveAttribute("title", `${hub.root}/${folderName}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator(`[data-action="info:${longPath.id}"]`).click();
  const secondary = page.locator('[data-flow="rename"]');
  await secondary.focus();
  const focused = (await secondary.elementHandle())!;
  await hubPost(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.b, displayName: "Background addition", start: false });
  await expect(page.locator(".mh-workspace")).toHaveCount(3);
  expect(await focused.evaluate(node => node.isConnected)).toBe(true);
  await expect(secondary).toBeFocused();
  await page.locator('[data-action="hub"]').click();
  failState = true;
  // Exercise the real live-entry refresh timer, not a fresh document's boot.
  const failedRefresh = page.waitForResponse(response => new URL(response.url()).pathname === "/api/hub/state" && response.status() === 503);
  await failedRefresh;
  await expect(page.locator('.mh-page [role="alert"]')).toBeVisible();
  failState = false;
  await page.locator('[data-action="refresh"]').click();
  await expect(page.locator(".mh-workspace")).toHaveCount(3);
  await page.unrouteAll({ behavior: "wait" });
  let releaseStart!: () => void;
  const startGate = new Promise<void>(resolve => { releaseStart = resolve; });
  let releaseDocument!: () => void;
  const documentGate = new Promise<void>(resolve => { releaseDocument = resolve; });
  await page.route(`**/api/hub/sessions/${workspace.id}/start`, async route => {
    await startGate;
    await route.continue();
  }, { times: 1 });
  await page.route(`**/s/${workspace.id}/api/state`, async route => { await documentGate; await route.continue(); }, { times: 1 });
  await page.locator(`[data-action="start:${workspace.id}"]`).click();
  await page.locator(".mh-sheet").getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator('.mh-sheet [data-action="commit-sheet"]')).toBeDisabled();
  await expect(page.locator(".mh-sheet")).toHaveAttribute("aria-busy", "true");
  releaseStart();
  await expect(page.getByRole("heading", { name: "Loading Opening target…", exact: true })).toBeVisible();
  releaseDocument();
  await expect(page).toHaveURL(new RegExp(`/s/${workspace.id}/`));
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
});

for (const viewport of [{ width: 320, height: 640 }, { width: 740, height: 390 }, { width: 1024, height: 1366 }]) {
  test(`touch Hub fits ${viewport.width}x${viewport.height}, live themes, enlarged text and titlebar`, async ({ page, hub }) => {
    await page.setViewportSize(viewport);
    await loginHub(page, hub);
    await expect(page.locator(".mh-dock")).toBeVisible();
    await expect(page.locator(".hub-nav")).toHaveCount(0);
    const colors: string[] = [];
    for (const colorScheme of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      colors.push(await page.locator(".mh-root").evaluate(node => getComputedStyle(node).backgroundColor));
      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".mh-root")!;
        for (const [role, size] of Object.entries({ page: 34, detail: 26, editor: 26, body: 17, value: 17, control: 15, secondary: 13, label: 13, navigation: 11 })) root.style.setProperty(`--mh-type-${role}`, `${size * 2}px`);
        document.documentElement.style.setProperty("--titlebar-inset", "60px");
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect((await page.locator(".mh-brand").boundingBox())!.y).toBeGreaterThanOrEqual(60);
      const nav = page.locator(".mh-dock");
      const box = (await nav.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      for (const button of await nav.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(colors[0]).not.toBe(colors[1]);
  });
}

test("fine-pointer Hub preserves desktop chrome at narrow and wide sizes", async ({ browser, hub }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await loginHub(page, hub);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".hub-mobile-nav")).toBeHidden();
    await expect(page.locator(".hub-nav")).toBeVisible();
    expect(await page.locator(".hub-header").evaluate(node => getComputedStyle(node).flexDirection)).toBe("column");
    await expect(page.locator('.hub-nav a[href="/clone"]')).toBeVisible();
    await page.evaluate(() => document.documentElement.style.setProperty("--titlebar-inset", "60px"));
    expect((await page.locator(".hub-header").boundingBox())!.y).toBeGreaterThanOrEqual(60);
  }
  await context.close();
});
