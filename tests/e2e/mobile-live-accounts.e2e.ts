import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "./hub-fixtures";

test.use({ hubAgentAccounts: true, hubCredentials: true, hubWorkspaces: ["mobile-accounts"] });
let directory: string, js: string, css: string;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(process.env.UATU_TEST_TEMP_ROOT ?? tmpdir(), "mobile-live-browser-"));
  execFileSync("bun", ["build", "tests/e2e/mobile-live-test-entry.ts", "--target=browser", `--outdir=${directory}`]);
  js = await readFile(`${directory}/mobile-live-test-entry.js`, "utf8");
  css = await readFile(`${directory}/mobile-live-test-entry.css`, "utf8");
});
test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

// The real Hub still gates each document and every API. Only the authenticated
// HTML assembly is substituted; no API is intercepted and no agent is personal.
test.beforeEach(async ({ hubContext, hub }) => {
  await hubContext.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== hub.origin) return route.continue();
    if (url.pathname === "/__mobile-test-entry.js") return route.fulfill({ contentType: "text/javascript", body: js });
    if (url.pathname === "/__mobile-test-entry.css") return route.fulfill({ contentType: "text/css", body: css });
    if (!request.isNavigationRequest() || !["/", "/settings", "/clone"].includes(url.pathname)) return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() !== 200) return route.fulfill({ response });
    return route.fulfill({ response, body: '<!doctype html><html data-ui-mode="touch"><head><meta name="uatu-hub" content="true"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__mobile-test-entry.css"></head><body><main id="live-mobile-test" style="position:fixed;inset:0"></main><script type="module" src="/__mobile-test-entry.js"></script></body></html>' });
  });
});

test("phone accounts use real Hub routes, conditional key validation and masked cleared secrets", async ({ hubContext }) => {
  const page = await hubContext.newPage(); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?detail=agent&id=opencode");
  await expect(page.getByRole("heading", { name: "OpenCode", exact: true })).toBeVisible();
  await expect(page.locator(".mh-flow-page")).toContainText("machine-wide");
  await page.getByLabel("Search providers").fill("cloud");
  await page.getByRole("button", { name: /Cloudflare Workers AI/ }).click();
  await page.locator('[data-flow="method-0"]').click();
  const key = page.locator('input[name="account-key"]');
  await expect(key).toHaveAttribute("type", "password");
  await key.fill("bad-key"); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("required");
  await expect(key).toHaveValue("");
  await page.locator('[name="answer-0"]').fill("abc123");
  await key.fill("bad-key"); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("refused");
  await expect(key).toHaveValue("");
  await key.fill("cf-good-key"); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("Logged in");
  expect(page.url()).not.toMatch(/bad-key|cf-good-key|abc123/);
  await expect(page.locator(".mh-dock .mh-tab")).toHaveCount(2);
});

test("phone login attempts expose code flow, clear a rejected code, cancel and retain truthful status", async ({ hubContext }) => {
  const page = await hubContext.newPage();
  await page.goto("/settings?detail=agent&id=claude");
  await page.locator('[data-flow="method-0"]').click();
  await page.getByRole("button", { name: "Start login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent login", exact: true })).toBeVisible();
  await expect(page.locator('[name="account-response"]')).toHaveAttribute("type", "password");
  await expect(page.getByRole("link", { name: "Open login page in a new tab" })).toHaveAttribute("target", "_blank");
  await page.locator('[name="account-response"]').fill("disposable-wrong-code");
  await page.getByRole("button", { name: "Submit login response" }).click();
  await expect(page.locator('[name="account-response"]')).toHaveValue("");
  await expect(page.locator(".mh-flow-error")).not.toBeEmpty();
  await page.getByRole("button", { name: "Refresh login status" }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("failed");
  await page.getByRole("button", { name: "Review login methods to try again" }).click();
  await page.locator('[data-flow="method-0"]').click();
  await page.getByRole("button", { name: "Start login", exact: true }).click();
  await page.getByRole("button", { name: "Cancel login", exact: true }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("cancelled");
  expect(page.url()).not.toContain("disposable-wrong-code");
});
