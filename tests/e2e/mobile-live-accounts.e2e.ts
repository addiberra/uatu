import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "./hub-fixtures";

test.use({ hubAgentAccounts: true, hubCredentials: true, hubWorktrees: true, hubWorkspaces: ["mobile-accounts"] });
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

test("compact checkout More owns creation and clean deletion through real worktree routes", async ({ hubContext }) => {
  const page = await hubContext.newPage(); await page.goto("/");
  await expect(page.locator(".mh-workspace")).toHaveCount(1);
  await expect(page.locator(".mh-workspace-family")).toHaveCount(0);
  await expect(page.locator(".mh-page").getByRole("button", { name: /Rename|Create branch/ })).toHaveCount(0);
  await page.locator(".mh-more").click();
  await page.getByRole("button", { name: /Branches and worktrees/ }).click();
  await page.getByRole("button", { name: "Create branch or worktree", exact: true }).click();
  await page.getByLabel("New branch name").fill("phone-checkout");
  await page.getByRole("button", { name: "Create worktree", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
  await expect(page.locator(".mh-flow-page")).toContainText("Not started");
  await expect(page.locator(".mh-flow-page")).toContainText("Operation identity");
  await page.getByRole("button", { name: "Refresh checkouts", exact: true }).click();
  await page.getByRole("button", { name: /^phone-checkout,/ }).click();
  await page.getByRole("button", { name: "Check deletion safety", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delete worktree?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete worktree", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
  const response = await hubContext.request.get("/api/hub/worktrees?source=mobile-accounts");
  const { inventory } = await response.json();
  expect(inventory.checkouts).toHaveLength(1);
  expect(inventory.refs.local).toContain("phone-checkout"); // deletion never deletes the branch
});

test("phone worktree deletion requires exact disclosed local-data acknowledgement", async ({ hubContext, hub }) => {
  const response = await hubContext.request.post("/api/hub/worktrees/create", { headers: { origin: hub.origin }, data: { sourceWorkspaceId: "mobile-accounts", mode: "new-branch", branch: "phone-dirty", base: { kind: "local", ref: "main" } } });
  const created = await response.json(); expect(created.ok).toBe(true);
  await writeFile(path.join(created.checkout.path, "local-note.txt"), "disposable untracked file\n");
  const writes: unknown[] = [];
  const page = await hubContext.newPage();
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/worktrees/delete")) writes.push(request.postDataJSON()); });
  await page.goto("/?detail=workspace&id=mobile-accounts");
  await page.getByRole("button", { name: /Branches and worktrees/ }).click();
  await page.getByRole("button", { name: /^phone-dirty,/ }).click();
  await page.getByRole("button", { name: "Check deletion safety", exact: true }).click();
  await expect(page.locator(".mh-sheet")).toContainText("local-note.txt");
  await page.getByRole("button", { name: "Delete worktree", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("Acknowledge"); expect(writes).toHaveLength(0);
  await page.getByRole("switch", { name: "Permanently delete these files with the worktree" }).check();
  await page.getByRole("button", { name: "Delete worktree", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ confirm: true, localDataFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(writes[0]).not.toHaveProperty("force");
});

test("phone fetch refusal retains creation draft and forgotten owned checkout can be registered without recreation", async ({ hubContext, hub }) => {
  const response = await hubContext.request.post("/api/hub/worktrees/create", { headers: { origin: hub.origin }, data: { sourceWorkspaceId: "mobile-accounts", mode: "new-branch", branch: "phone-register", base: { kind: "local", ref: "main" } } });
  const created = await response.json(); expect(created.ok).toBe(true);
  const page = await hubContext.newPage(); await page.goto("/?detail=workspace&id=mobile-accounts");
  await page.getByRole("button", { name: /Branches and worktrees/ }).click();
  await page.getByRole("button", { name: "Create branch or worktree", exact: true }).click();
  await page.getByLabel("New branch name").fill("kept-draft");
  await page.getByRole("button", { name: "Fetch remote branches", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).not.toBeEmpty();
  await expect(page.getByLabel("New branch name")).toHaveValue("kept-draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /^phone-register,/ }).click();
  await page.getByRole("button", { name: "Remove from Uatu", exact: true }).click();
  await expect(page.locator(".mh-sheet")).toContainText("Checkout, branch, files and creation provenance remain");
  await page.getByRole("button", { name: "Stop and remove registration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh checkouts", exact: true }).click();
  await page.getByRole("button", { name: /^phone-register,/ }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("Not registered");
  await page.getByRole("button", { name: "Register workspace", exact: true }).click();
  await page.locator('.mh-task').getByRole("button", { name: "Register workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worktree operation completed", exact: true })).toBeVisible();
  const { inventory } = await (await hubContext.request.get("/api/hub/worktrees?source=mobile-accounts")).json();
  expect(inventory.checkouts.find((row: any) => row.checkoutId === created.checkout.checkoutId)).toMatchObject({ registered: true, ownership: "uatu", path: created.checkout.path, running: false });
});
