import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, loginHub, hubPost } from "./hub-mobile-fixtures";
import type { PublicCredentialDto } from "../../src/hub/credential-types";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Real CLI/credential owners and disposable private HOME; no personal keys,
// remote authentication, paid provider or synthetic credential operation.
for (const type of ["ssh", "openpgp"] as const) {
  test(`phone ${type} generates, exposes public-only facts, unlocks, checks, disables, deletes and imports a disposable key`, async ({ page, hub }) => {
    test.setTimeout(180_000);
    await loginHub(page, hub);
    const writes: string[] = [];
    page.on("request", request => { if (request.method() === "POST") writes.push(new URL(request.url()).pathname); });
    const catalog = async (): Promise<PublicCredentialDto[]> => (await (await page.request.get(`${hub.origin}/api/hub/credentials`)).json()).credentials;
    const commit = () => page.locator('.mh-task [data-action="commit-sheet"]').click();
    const fact = (name: string) => page.locator(`[data-credential-fact="${name}"] .mh-info-value`);
    const passphrase = "disposable-phone-key-passphrase";
    const name = `Disposable phone ${type}`;
    await page.goto(`${hub.origin}/settings?detail=add-credential`);
    await page.locator(`[data-flow="${type}"]`).click(); await page.locator(`[data-flow="${type === "ssh" ? "ssh" : "pgp"}-generate"]`).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    if (type === "openpgp") await page.getByLabel("User ID (name and email)", { exact: true }).fill("Phone fixture <phone@example.invalid>");
    const secret = page.getByLabel("Passphrase", { exact: true }); await expect(secret).toHaveAttribute("type", "password");
    await secret.fill(passphrase); const original = await secret.elementHandle(); await commit();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 45_000 });
    expect(await original!.evaluate(el => (el as HTMLInputElement).value)).toBe("");
    const generated = (await catalog())[0]!; expect(generated.type).toBe(type); if (generated.type === "token") throw new Error("Expected a generated key");
    await expect(fact("protection")).toHaveText("Set");
    if (type === "openpgp") await expect(fact("userId")).toHaveText("Phone fixture <phone@example.invalid>");
    await page.locator('[data-flow="public"]').click();
    await expect(page.locator(".mh-public-key")).toContainText(type === "ssh" ? "ssh-ed25519" : "BEGIN PGP PUBLIC KEY BLOCK");
    await expect(page.locator(".mh-public-key")).not.toContainText(/PRIVATE KEY|passphrase/);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    if (type === "ssh") { await page.locator('[data-flow="lock"]').click(); await expect(fact("lock")).toHaveText("Locked"); }
    if (await page.locator('[data-flow="unlock"]').count()) {
      await page.locator('[data-flow="unlock"]').click(); await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await commit();
      await expect(fact("lock")).toHaveText("Unlocked");
    }
    await page.locator('[data-flow="test"]').click();
    const results = page.getByRole("region", { name: "Check Results", exact: true }); await expect(results).toContainText("Remote permissions have not been checked.");
    await page.getByRole("button", { name: /^View diagnostic report/ }).click(); await expect(page.locator("[data-readiness-layer]")).not.toHaveCount(0);
    await page.getByRole("button", { name: "Back", exact: true }).click(); await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.locator('[data-flow="toggle"]').click(); await commit(); await expect(page.locator('[data-flow="toggle"]')).toHaveText("Enable");
    await page.locator('[data-flow="toggle"]').click(); await expect(page.locator('[data-flow="toggle"]')).toHaveText("Disable");
    // Export only this fixture's own generated private material, in memory.
    const privateKey = type === "ssh" ? await readFile(path.join(hub.root, "state", "credential-secrets", `${generated.id}.key`), "utf8") : execFileSync("gpg", ["--homedir", path.join(hub.root, "state", "credential-gnupg"), "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--armor", "--export-secret-keys", generated.metadata.fingerprint], { env: hub.env, input: `${passphrase}\n`, encoding: "utf8", timeout: 15_000 });
    await page.locator('[data-flow="delete"]').click(); await commit(); await expect.poll(catalog).toEqual([]);
    await page.goto(`${hub.origin}/settings?detail=add-credential`);
    await page.locator(`[data-flow="${type}"]`).click(); await page.locator(`[data-flow="${type === "ssh" ? "ssh" : "pgp"}-import"]`).click();
    await page.getByLabel("Name", { exact: true }).fill(`Imported phone ${type}`);
    const file = page.getByLabel("Private key file (preferred)"); await file.setInputFiles({ name: "disposable.key", mimeType: "text/plain", buffer: Buffer.from(privateKey) });
    if (type === "ssh") await page.getByLabel("Existing passphrase, if any").fill(passphrase);
    const source = await file.elementHandle(); await commit(); await expect(page.getByRole("heading", { name: `Imported phone ${type}`, exact: true })).toBeVisible({ timeout: 45_000 });
    expect(await source!.evaluate(el => (el as HTMLInputElement).value)).toBe("");
    const imported = (await catalog())[0]!; expect(imported.type).toBe(type); expect(imported.metadata).toEqual(generated.metadata);
    expect(JSON.stringify(await catalog())).not.toContain(passphrase); expect(JSON.stringify(await catalog())).not.toContain(privateKey);
    expect(writes.some(route => /\/agent-accounts\/|\/sessions\/.*\/start|\/clone-jobs$/.test(route))).toBe(false);
    expect(page.url()).not.toContain(passphrase);
  });
}

test("phone assignment normalizes hosts, preserves omitted signing and starts only after both real SSH unlocks", async ({ page, hub }) => {
  test.setTimeout(180_000); await loginHub(page, hub);
  const post = <T>(route: string, data?: unknown) => hubPost<T>(page.request, hub, route, data);
  const passphrase = "disposable-multi-key-passphrase";
  const keys: PublicCredentialDto[] = [];
  for (const [name, capability] of [["Phone authentication", "ssh-authentication"], ["Phone signing", "ssh-signing"]]) keys.push((await post<{ credential: PublicCredentialDto }>("/api/hub/credentials/ssh/generate", { name, capabilities: [capability], passphrase })).credential);
  const configured = await post<{ workspace: { id: string } }>("/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "Unlock both keys", start: false });
  const id = configured.workspace.id;
  let assignments = 0, starts = 0, unlocks = 0;
  page.on("request", request => { if (request.method() !== "POST") return; const route = new URL(request.url()).pathname; if (route.endsWith("/credential-assignments")) assignments++; if (route.endsWith("/start")) starts++; if (route.endsWith("/unlock")) unlocks++; });
  const openEditor = async (mode = "edit") => { await page.goto(`${hub.origin}/settings?detail=assignments`); await page.locator(`[data-flow="workspace-${id}"]`).click(); await page.locator(`[data-flow="${mode}-${id}"]`).click(); };
  await openEditor();
  await page.getByRole("combobox", { name: "Git authentication credential", exact: true }).selectOption(keys[0]!.id);
  await page.getByRole("textbox", { name: "Authentication host", exact: true }).fill("https://EXAMPLE.TEST/");
  await page.getByRole("combobox", { name: "Commit signing credential", exact: true }).selectOption(keys[1]!.id);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".mh-task")).toContainText("example.test"); expect(assignments).toBe(0);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => assignments).toBe(1);
  const current = async () => { const { credentials } = await (await page.request.get(`${hub.origin}/api/hub/credentials`)).json() as { credentials: PublicCredentialDto[] }; return credentials.flatMap(credential => credential.assignments); };
  await expect.poll(current).toEqual(expect.arrayContaining([{ workspaceId: id, credentialId: keys[0]!.id, role: "authentication", host: "example.test" }, { workspaceId: id, credentialId: keys[1]!.id, role: "signing" }]));
  await expect(page.locator('.mh-task')).toHaveCount(0); await expect(page.locator('.mh-flow-page h1')).toHaveText("Unlock both keys");
  await openEditor(); await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".mh-sheet-error")).toContainText("No changes"); expect(assignments).toBe(1);
  await openEditor("new"); await expect(page.getByRole("combobox", { name: "Commit signing credential", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Git authentication credential", exact: true }).selectOption(keys[0]!.id);
  await page.getByRole("textbox", { name: "Authentication host", exact: true }).fill("other.example.test");
  await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(current).toEqual(expect.arrayContaining([{ workspaceId: id, credentialId: keys[0]!.id, role: "authentication", host: "example.test" }, { workspaceId: id, credentialId: keys[0]!.id, role: "authentication", host: "other.example.test" }, { workspaceId: id, credentialId: keys[1]!.id, role: "signing" }])); expect(assignments).toBe(2);
  await expect(page.locator('.mh-task')).toHaveCount(0); await expect(page.locator('.mh-flow-page h1')).toHaveText("Unlock both keys");
  for (const key of keys) await post(`/api/hub/credentials/${key.id}/lock`);
  await page.goto(`${hub.origin}/?detail=workspace&id=${id}`); await page.getByRole("button", { name: "Start", exact: true }).click();
  const started = page.waitForResponse(response => new URL(response.url()).pathname === `/api/hub/sessions/${id}/start` && response.request().method() === "POST");
  for (let index = 0; index < 2; index++) {
    await expect(page.getByRole("region", { name: "Unlock workspace credential", exact: true })).toBeVisible(); expect(starts).toBe(0);
    const task = await page.locator('.mh-task').elementHandle();
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect.poll(() => unlocks).toBe(index + 1);
    if (index === 0) { await expect.poll(() => task!.evaluate(el => el.isConnected)).toBe(false); await expect(page.locator('.mh-task input[type="password"]')).toHaveValue(""); }
  }
  expect((await started).ok()).toBe(true);
  await page.waitForURL(new RegExp(`/s/${id}/`), { waitUntil: "domcontentloaded", timeout: 10_000 });
  await expect(page.locator("#preview-path")).toHaveText("docs/guide.md"); expect(starts).toBe(1); expect(unlocks).toBe(2);
  expect(page.url()).not.toContain(passphrase);
});

test("phone saved tool override remains separate from discovery and automatic discovery is draft-only until Save", async ({ page, hub }) => {
  await loginHub(page, hub);
  const read = async () => (await (await page.request.get(`${hub.origin}/api/hub/credential-tools`)).json()).tools.find((tool: { tool: string }) => tool.tool === "git");
  const initial = await read(); expect(initial.path).toMatch(/^\//);
  const writes: unknown[] = [];
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/hub/credential-tools/git") writes.push(request.postDataJSON()); });
  await page.goto(`${hub.origin}/settings?detail=tools`); await page.locator('[data-flow="tool-git"]').click(); await page.locator('[data-flow="override-git"]').click();
  const input = page.getByLabel("Absolute executable path", { exact: true }); await expect(input).toHaveValue("");
  await input.fill("relative"); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.locator(".mh-sheet-error")).toContainText("absolute"); expect(writes).toEqual([]);
  await input.fill(initial.path); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.locator(".mh-task")).toHaveCount(0);
  await page.locator('[data-flow="override-git"]').click(); await expect(input).toHaveValue(initial.path);
  await page.getByRole("button", { name: "Use automatic discovery", exact: true }).click(); await expect(input).toHaveValue(""); expect(writes).toEqual([{ path: initial.path }]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.locator('[data-flow="override-git"]').click(); await expect(input).toHaveValue(initial.path);
  await page.getByRole("button", { name: "Use automatic discovery", exact: true }).click(); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.locator(".mh-task")).toHaveCount(0);
  expect(writes).toEqual([{ path: initial.path }, { path: null }]);
  await page.locator('[data-flow="test-git"]').click(); await expect(page.getByRole("region", { name: "Check Results", exact: true })).toContainText("Local setup only");
  await page.getByRole("button", { name: /^View diagnostic report/ }).click(); await expect(page.locator("[data-readiness-layer]")).not.toHaveCount(0);
});
