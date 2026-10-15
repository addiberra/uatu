import { writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "./hub-fixtures";

test.use({ hubAgentAccounts: true, hubCredentials: true, hubWorktrees: true, hubWorkspaces: ["mobile-accounts"] });
// Real production HTML, assets, authentication and APIs. Agent runtimes remain
// disposable fakes; no personal provider is contacted.

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

test("phone device login honors conditional fields, displays selectable code and expires without retry", async ({ hubContext, hub }) => {
  const page = await hubContext.newPage(); await page.goto("/settings?detail=agent&id=opencode");
  await page.getByLabel("Search providers").fill("copilot"); await page.getByRole("button", { name: /GitHub Copilot/ }).click();
  await page.locator('[data-flow="method-0"]').click();
  await expect(page.locator('[name="answer-1"]')).toBeHidden();
  await page.locator('[name="answer-0"]').selectOption("enterprise");
  await expect(page.locator('[name="answer-1"]')).toBeVisible();
  await page.getByRole("button", { name: "Start login", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("required");
  await page.locator('[name="answer-0"]').selectOption("github.com");
  await fetch(hub.agentAccountsControl!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "expireNextAfter", ms: 1500 }) });
  await page.getByRole("button", { name: "Start login", exact: true }).click();
  await expect(page.locator(".mh-device-code")).toHaveText("15EF-0DB6");
  await expect(page.getByRole("button", { name: "Copy device code", exact: true })).toBeVisible();
  await expect(page.locator(".mh-flow-page")).toContainText("expired");
  await expect(page.getByRole("button", { name: "Review login methods to try again", exact: true })).toBeVisible();
});

test("phone redirect refuses a hostile address without leaking it, then completes only the bound loopback callback", async ({ hubContext }) => {
  const page = await hubContext.newPage(); await page.goto("/settings?detail=agent&id=opencode");
  await page.getByLabel("Search providers").fill("openai"); await page.getByRole("button", { name: /^OpenAI,/ }).click();
  await page.locator('[data-flow="method-0"]').click(); await page.getByRole("button", { name: "Start login", exact: true }).click();
  const auth = new URL((await page.getByRole("link", { name: "Open login page in a new tab" }).getAttribute("href"))!);
  const input = page.getByLabel("Whole localhost redirect address"); await expect(input).toHaveAttribute("type", "password");
  await input.fill("https://attacker.invalid/?code=do-not-leak"); await page.getByRole("button", { name: "Submit login response", exact: true }).click();
  await expect(input).toHaveValue(""); await expect(page.locator(".mh-flow-error")).not.toBeEmpty();
  expect(page.url()).not.toContain("do-not-leak");
  const callback = new URL(auth.searchParams.get("redirect_uri")!); callback.searchParams.set("state", auth.searchParams.get("state")!); callback.searchParams.set("code", "fixture-code");
  await input.fill(callback.href); await page.getByRole("button", { name: "Submit login response", exact: true }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("complete");
  expect(page.url()).not.toContain("fixture-code");
});

test("phone OpenCode multiple-credential activation and logout keep machine-wide warning", async ({ hubContext, hub }) => {
  await fetch(hub.agentAccountsControl!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "twoGroqKeys" }) });
  const page = await hubContext.newPage(); await page.goto("/settings?detail=agent&id=opencode");
  await page.getByLabel("Search providers").fill("groq"); await page.getByRole("button", { name: /^Groq,/ }).click();
  const activate = page.getByRole("button", { name: /^Activate / });
  await expect(activate).toHaveCount(1); await activate.click();
  await expect(page.locator(".mh-sheet")).toContainText("machine-wide");
  await page.getByRole("button", { name: "Activate agent credential", exact: true }).click();
  await expect(page.locator(".mh-sheet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate Groq work", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Log out / }).first().click();
  await page.getByRole("button", { name: "Log out agent credential", exact: true }).click();
  await expect(page.locator(".mh-flow-page")).toContainText("machine-wide");
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
