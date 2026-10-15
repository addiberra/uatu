import { describe, expect, test } from "bun:test";
import { credentialFactsFromSnapshot, decodeCredentialCatalog, decodeCredentialTools, decodeDefaultFolder, decodeHubState, toolConfigurationFromSnapshot } from "./live-read-model";

const workspace = (id = "a") => ({
  id, displayName: "Same name", path: `/projects/${id}`, backend: "local", running: false,
  credentialRestartRequired: false, workspaceApiRevision: 7,
  credentialAssignments: { authentication: ["Git identity"], signing: [] },
});
const state = () => ({ version: "test", hubApiRevision: 8, workspaceApiRevision: 7, workspaces: [workspace()] });
const credential = (type: "ssh" | "openpgp" | "token" = "ssh") => ({
  id: type, name: "Key name is not a lock fact", type, enabled: true, createdAt: "2026-10-15T00:00:00Z",
  capabilities: type === "ssh" ? ["ssh-authentication", "ssh-signing"] : type === "openpgp" ? ["openpgp-signing"] : ["https-git", "github-cli"],
  metadata: type === "token" ? { host: "example.test", username: "git" } : { publicKey: "public-test-data", fingerprint: "public-fingerprint" },
  assignments: [{ workspaceId: "a", credentialId: type, role: type === "openpgp" ? "signing" : "authentication", ...(type === "openpgp" ? {} : { host: "example.test" }) }],
  readiness: [{ layer: "credential", status: "ready", message: "Unlocked: prose is not structured protection metadata" }],
});

describe("current Hub read decoders", () => {
  test("authoritative checkout variants survive decoding independently of legacy fallback labels", () => {
    for (const checkout of [{ kind: "named", name: "topic" }, { kind: "unborn", name: "new" }, { kind: "detached", commit: "a".repeat(40) }, { kind: "non-git" }, { kind: "unavailable", message: "Unavailable" }]) {
      const decoded = decodeHubState({ ...state(), workspaces: [{ ...workspace(), branch: "fallback", checkout }] });
      expect<unknown>(decoded.workspaces[0]!.checkout).toEqual(checkout);
      expect(decoded.workspaces[0]!.running).toBe(false);
    }
    expect(decodeHubState(state()).workspaces[0]).not.toHaveProperty("checkout");
    for (const checkout of [{ kind: "detached" }, { kind: "named", name: "" }, { kind: "non-git", name: "fake" }, { kind: "loading" }, { kind: "detached", commit: "abbrev" }]) {
      expect(() => decodeHubState({ ...state(), workspaces: [{ ...workspace(), checkout }] })).toThrow();
    }
  });

  test("credential facts preserve protection/lock/UID and remain unknown for old payloads regardless of readiness prose", () => {
    for (const protection of ["protected", "unprotected", "unknown"]) {
      const row = decodeCredentialCatalog({ credentials: [{ ...credential(), facts: { protection, lock: "unknown", userId: null } }] })[0]!;
      expect<unknown>(row.facts?.protection).toBe(protection);
      expect(credentialFactsFromSnapshot(row).lock).toEqual({ status: "unknown" });
    }
    const old = decodeCredentialCatalog({ credentials: [credential()] })[0]!;
    expect(credentialFactsFromSnapshot(old).protection).toEqual({ status: "unknown" });
    const pgp = decodeCredentialCatalog({ credentials: [{ ...credential("openpgp"), facts: { protection: "unknown", lock: "unlocked", userId: "Signer <signer@example.test>" } }] })[0]!;
    expect(credentialFactsFromSnapshot(pgp).userId).toEqual({ status: "known", value: "Signer <signer@example.test>" });
    for (const facts of [{ protection: "protected", lock: "ready", userId: null }, { protection: "unprotected", lock: "locked", userId: "not-applicable" }, { protection: "unknown", lock: "unknown", userId: null, privateKey: "reject" }]) {
      expect(() => decodeCredentialCatalog({ credentials: [{ ...credential(), facts }] })).toThrow();
    }
  });

  test("tool absence and saved overrides are independent of effective paths and legacy omission", () => {
    const tool = { tool: "ssh", path: null, version: null, guidance: "Install", results: [] };
    for (const savedOverride of [undefined, null, "/saved/missing/ssh"]) {
      const [decoded] = decodeCredentialTools({ tools: [{ ...tool, ...(savedOverride === undefined ? {} : { savedOverride }) }] });
      expect(decoded!.path).toBeNull();
      expect(toolConfigurationFromSnapshot(decoded!).savedOverride).toEqual(savedOverride === undefined ? { status: "unknown" } : { status: "known", value: savedOverride });
    }
    expect(() => decodeCredentialTools({ tools: [{ ...tool, savedOverride: "relative" }] })).toThrow();
    expect(() => decodeCredentialTools({ tools: [tool, tool] })).toThrow();
  });
  test("keeps absent facts unknown and assignment names distinct from ids", () => {
    const result = decodeHubState(state());
    expect<unknown>(result.workspaces[0]).toEqual(workspace());
    for (const key of ["branch", "detached", "shells", "availability", "ownership", "createWorktree"]) {
      expect(Object.hasOwn(result.workspaces[0]!, key)).toBe(false);
    }
    expect(result).not.toHaveProperty("identity");
    expect(result).not.toHaveProperty("workspaceDefaults");
    expect(result).not.toHaveProperty("worktreeApi");
    expect(result.workspaces[0]).not.toHaveProperty("assignments");
  });

  test("preserves complete reported checkout facts without interpreting a branch fallback", () => {
    const child = {
      ...workspace("child"), running: true, credentialRestartRequired: true,
      credentialAssignments: { authentication: [], signing: [] },
      parentId: "a", repositoryId: "repository-1", branch: "A fallback label", detached: true,
      sourceRef: "origin/topic", ownership: "external", availability: "replaced",
      shells: [{ attached: false, label: "" }, { attached: true, label: "editor" }],
    };
    const defaults = { configured: "/unavailable", configuredAvailable: false, effective: "/fallback" };
    const input = { ...state(), workspaces: [{ ...workspace(), createWorktree: true }, child], workspaceDefaults: defaults, worktreeApi: "/api/hub/worktrees" };
    const result = decodeHubState(input);
    expect<unknown>(result).toEqual(input);
    expect(result.workspaces[1]).not.toHaveProperty("commit");
    expect(result.workspaces[1]).not.toHaveProperty("worktree");
    // No guessed parent assignments, checkout id, branch kind or runtime state.
    expect(result.workspaces[1]!.credentialAssignments.authentication).toEqual([]);
    expect(result.workspaces[1]).not.toHaveProperty("runtime");
  });

  test("missing shell summary differs from a known empty inventory", () => {
    const result = decodeHubState({ ...state(), workspaces: [
      { ...workspace("a"), running: true }, { ...workspace("b"), running: true, shells: [] },
    ] });
    expect(result.workspaces[0]!.shells).toBeUndefined();
    expect(result.workspaces[1]!.shells).toEqual([]);
  });

  test("projects a detached copy and drops unknown state properties", () => {
    const input = { ...state(), secret: "never retain", workspaces: [{ ...workspace(), extra: "never retain" }] };
    const result = decodeHubState(input);
    input.workspaces[0]!.credentialAssignments.authentication.push("later");
    expect(result).not.toHaveProperty("secret");
    expect(result.workspaces[0]).not.toHaveProperty("extra");
    expect(result.workspaces[0]!.credentialAssignments.authentication).toEqual(["Git identity"]);
  });

  test.each([
    null, [], {}, { ...state(), workspaces: null }, { ...state(), workspaces: [workspace(), workspace()] },
    { ...state(), hubApiRevision: 0 }, { ...state(), workspaceApiRevision: 1.5 },
    { ...state(), workspaceDefaults: { configured: null, effective: "/home" } },
    { ...state(), worktreeApi: null },
  ].map(input => ({ input })))("rejects malformed state envelopes: %#", ({ input }) => {
    expect(() => decodeHubState(input)).toThrow();
  });

  test.each([
    { running: "false" }, { credentialRestartRequired: null }, { workspaceApiRevision: -1 },
    { backend: "unknown" }, { id: "" }, { displayName: null }, { path: [] },
    { credentialAssignments: { authentication: ["duplicate", "duplicate"], signing: [] } },
    { credentialAssignments: { authentication: [], signing: [1] } },
    { shells: [{ attached: "true", label: "shell" }] }, { shells: null },
    { parentId: "" }, { branch: null }, { detached: false }, { createWorktree: false },
    { ownership: "main" }, { availability: "present" },
  ])("rejects malformed known workspace fields rather than coercing: %#", patch => {
    expect(() => decodeHubState({ ...state(), workspaces: [{ ...workspace(), ...patch }] })).toThrow();
  });

  test("default-folder decoding preserves saved unavailable vs fallback and clear state", () => {
    for (const input of [
      { configured: "/saved", configuredAvailable: false, effective: "/fallback" },
      { configured: null, configuredAvailable: false, effective: "/home" },
      { configured: "/saved", configuredAvailable: true, effective: "/saved" },
    ]) expect(decodeDefaultFolder(input)).toEqual(input);
    for (const input of [null, {}, { configured: null, configuredAvailable: "false", effective: "/home" }, { configured: null, configuredAvailable: false, effective: null }]) {
      expect(() => decodeDefaultFolder(input)).toThrow();
    }
  });

  test("uses the existing type-specific public credential parser, without inferring facts", () => {
    const credentials = [credential("ssh"), credential("openpgp"), credential("token")];
    const result = decodeCredentialCatalog({ credentials });
    expect<unknown>(result).toEqual(credentials);
    for (const c of result) for (const key of ["lock", "protection", "userId", "token", "privateKey"]) expect(c).not.toHaveProperty(key);
    expect(decodeCredentialCatalog({ credentials: [] })).toEqual([]);
  });

  test.each([
    { type: "unknown" }, { enabled: "false" }, { capabilities: ["https-git"] },
    { metadata: { publicKey: "public" } }, { privateKey: "private-test-sentinel" },
    { readiness: [{ layer: "credential", status: "unknown", message: "bad" }] },
    { assignments: [{ workspaceId: "a", credentialId: "other", role: "signing" }] },
  ])("rejects bad or private credential fields without weakening the existing parser: %#", patch => {
    expect(() => decodeCredentialCatalog({ credentials: [{ ...credential(), ...patch }] })).toThrow();
  });

  test("rejects missing catalog and duplicate credential ids, not duplicate public names", () => {
    expect(() => decodeCredentialCatalog({})).toThrow();
    expect(() => decodeCredentialCatalog({ credentials: [credential(), credential()] })).toThrow();
    expect(decodeCredentialCatalog({ credentials: [credential("ssh"), credential("token")] })).toHaveLength(2);
  });
});
