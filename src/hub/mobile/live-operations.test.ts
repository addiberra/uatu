import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { resetAppBasePathForTests } from "../../shared/app-url";
import { createLiveTransport } from "./live-transport";
import { createLiveWorkspaceReads } from "./live-workspaces";
import { createLiveCredentials, privateKeyText } from "./live-credentials";
import { createLiveLifecycle } from "./live-lifecycle";
import { createLiveOnboarding } from "./live-onboarding";
import type { PrivateKeySource } from "./backend";

const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeEach(() => {
  const { document } = parseHTML('<html><head><meta name="uatu-hub" content="true"><meta name="uatu-base-path" content="/s/child/"></head></html>');
  Object.defineProperty(globalThis, "document", { configurable: true, value: document }); resetAppBasePathForTests();
});
afterEach(() => {
  if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document");
  resetAppBasePathForTests();
});
const workspace = (id: string) => ({ id, displayName: "Duplicate", path: `/projects/${id}`, backend: "local", running: false, credentialRestartRequired: false, workspaceApiRevision: 24, credentialAssignments: { authentication: [], signing: [] } });
const credential = (id = "ssh", type: "ssh" | "openpgp" = "ssh") => ({
  id, name: "Disposable key", type, enabled: true, createdAt: "2026-10-15T00:00:00Z",
  capabilities: type === "ssh" ? ["ssh-authentication"] : ["openpgp-signing"],
  metadata: { publicKey: "test-public-key", fingerprint: "test-fingerprint" },
  assignments: [{ workspaceId: "parent", credentialId: id, role: type === "ssh" ? "authentication" : "signing", ...(type === "ssh" ? { host: "example.test" } : {}) }],
  readiness: [{ layer: "runtime", status: "ready", message: "Not a lock fact" }],
  facts: { protection: "protected", lock: "locked", userId: null },
});

test("workspace join uses parent policy, never names or fallback branch labels, and never starts a child", async () => {
  const calls: string[] = [];
  const transport = createLiveTransport({ fetch: async (route, init) => {
    calls.push(`${init?.method} ${route}`);
    return Response.json(route.endsWith("state") ? { version: "test", hubApiRevision: 13, workspaceApiRevision: 24, workspaces: [workspace("parent"), { ...workspace("child"), parentId: "parent", repositoryId: "family", branch: "not-a-fact" }] } : { credentials: [credential()] });
  } });
  const result = await createLiveWorkspaceReads(transport).readWorkspace("child");
  expect(result).toMatchObject({ status: "available", value: { id: "child", parentId: "parent", branch: { kind: "unavailable" }, assignments: [{ workspaceId: "parent", credentialId: "ssh" }] } });
  expect(calls).toEqual(["GET /api/hub/state", "GET /api/hub/credentials"]);
});

test("missing parent or unavailable catalog cannot become empty assignments", async () => {
  for (const absentCatalog of [true, false]) {
    const transport = createLiveTransport({ fetch: async route => route.endsWith("state") ? Response.json({ version: "test", hubApiRevision: 13, workspaceApiRevision: 24, workspaces: [{ ...workspace("child"), parentId: "missing" }] }) : Response.json({ credentials: [] }, { status: absentCatalog ? 503 : 200 }) });
    expect((await createLiveWorkspaceReads(transport).readWorkspaces()).status).toBe("unavailable");
  }
});

test("all required inherited unlocks precede one explicitly authorized Start", async () => {
  const catalog = [credential(), credential("pgp", "openpgp")];
  let starts = 0;
  const transport = createLiveTransport({ fetch: async (route, init) => {
    if (route.endsWith("state")) return Response.json({ version: "test", hubApiRevision: 13, workspaceApiRevision: 24, workspaces: [workspace("parent"), { ...workspace("child"), parentId: "parent" }] });
    if (route.endsWith("credentials")) return Response.json({ credentials: catalog });
    if (route.endsWith("/unlock")) {
      const row = catalog.find(row => route.includes(`/${row.id}/`))!;
      expect(JSON.parse(init!.body as string)).toEqual({ passphrase: "disposable" });
      row.facts.lock = "unlocked";
      return Response.json({ credential: row });
    }
    if (route === "/api/hub/sessions/child/start") { starts++; return Response.json({ id: "child", running: true }); }
    throw new Error("Unexpected route");
  } });
  const reads = createLiveWorkspaceReads(transport), credentials = createLiveCredentials(transport, reads);
  const lifecycle = createLiveLifecycle(transport, { ...reads, ...credentials });
  const intent = { workspaceId: "child", unassigned: "not-confirmed" as const };
  expect(await lifecycle.startWorkspace(intent)).toMatchObject({ status: "completed", value: { status: "requires-unlock", credentials: [{ id: "ssh" }, { id: "pgp" }] } });
  expect(starts).toBe(0);
  expect((await credentials.unlockCredential({ target: { id: "ssh", type: "ssh" }, passphrase: "disposable" })).status).toBe("completed");
  expect(await lifecycle.startWorkspace(intent)).toMatchObject({ status: "completed", value: { status: "requires-unlock", credentials: [{ id: "pgp" }] } });
  expect(starts).toBe(0);
  expect((await credentials.unlockCredential({ target: { id: "pgp", type: "openpgp" }, passphrase: "disposable" })).status).toBe("completed");
  expect(starts).toBe(0);
  expect(await lifecycle.startWorkspace(intent)).toMatchObject({ status: "completed", value: { status: "running", workspaceId: "child" } });
  expect(starts).toBe(1);
});

test("private-key source and size validation happens before File.text and no mixed source is accepted", async () => {
  let reads = 0;
  const file = new File([new Uint8Array(1_048_577)], "disposable.key");
  file.text = async () => { reads++; return "private"; };
  await expect(privateKeyText({ kind: "file", file })).rejects.toThrow("1 MiB");
  expect(reads).toBe(0);
  await expect(privateKeyText({ kind: "file", file, text: "second-source" } as unknown as PrivateKeySource)).rejects.toThrow();
  await expect(privateKeyText({ kind: "paste", text: "", file } as unknown as PrivateKeySource)).rejects.toThrow();
  expect(await privateKeyText({ kind: "paste", text: "disposable-private-key" })).toBe("disposable-private-key");
});

test("delayed key file read cannot submit into a different authentication generation", async () => {
  let release!: (text: string) => void, calls = 0;
  const file = new File(["private"], "disposable.key"); file.text = () => new Promise(resolve => { release = resolve; });
  const transport = createLiveTransport({ fetch: async () => { calls++; return Response.json({}); } });
  const credentials = createLiveCredentials(transport, createLiveWorkspaceReads(transport));
  const pending = credentials.importSsh({ name: "Test", capabilities: ["ssh-authentication"], passphrase: "", source: { kind: "file", file } });
  transport.invalidate("signed-out"); release("private");
  expect((await pending).status).toBe("rejected"); expect(calls).toBe(0);
});

test("malformed or wrong-identity mutation results are indeterminate, not success", async () => {
  const transport = createLiveTransport({ fetch: async () => Response.json({ credential: credential("other") }) });
  const credentials = createLiveCredentials(transport, createLiveWorkspaceReads(transport));
  expect((await credentials.lockSsh({ id: "ssh", type: "ssh" })).status).toBe("indeterminate");
});

test("onboarding keeps initialized path, committed recovery and start-failure outcomes distinct", async () => {
  for (const [status, body, expected] of [
    [409, { needsInit: true, error: "private-tool-output" }, { status: "failed", code: "needs-init" }],
    [500, { code: "recovery-required", retainedPath: "/retained", error: "private-tool-output" }, { status: "failed", retainedPath: "/retained" }],
    [200, { workspace: workspace("saved"), started: false, startError: null, recoveryRequired: "private-tool-output" }, { status: "failed", code: "recovery-required", committedEntry: { id: "saved" } }],
    [200, { workspace: workspace("saved"), started: false, startError: "private-tool-output" }, { status: "configured", result: { entry: { id: "saved" }, started: false, created: true } }],
  ] as const) {
    const transport = createLiveTransport({ fetch: async () => Response.json(body, { status }) });
    const result = await createLiveOnboarding(transport).configureExisting({ path: "/existing", displayName: "Existing", authentication: [], signing: null, init: false, start: true });
    expect(result).toMatchObject({ status: "completed", value: expected });
    expect(JSON.stringify(result)).not.toContain("private-tool-output");
  }
});

test("folder stop dependency is a refusal with exact IDs, not success or an automatic stop", async () => {
  let calls = 0;
  const transport = createLiveTransport({ fetch: async () => { calls++; return Response.json({ needsStop: true, workspaceIds: ["a", "b"] }, { status: 409 }); } });
  expect(await createLiveOnboarding(transport).renameFolder({ path: "/existing", name: "new", stop: "ask" })).toEqual({ status: "completed", value: { status: "needs-stop", workspaceIds: ["a", "b"] } });
  expect(calls).toBe(1);
});
