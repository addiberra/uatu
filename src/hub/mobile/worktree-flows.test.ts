import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { createSyntheticBackend } from "../../../tests/mobile-hub-review/backend";
import { mountMobileHub } from "./frontend";
import type { MobileWorktrees } from "./worktrees";
import type { WorktreeCheckout, WorktreeInventory, WorktreeOperationResult } from "../../shared/worktree-contract";

const originals = new Map(["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let root: HTMLElement, cleanup: (() => void) | undefined;
beforeEach(() => {
  const dom = parseHTML('<html><body><div id="hub"></div></body></html>');
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.document })) Object.defineProperty(globalThis, key, { configurable: true, value });
  Object.defineProperty(dom.window, "localStorage", { configurable: true, value: { getItem: () => null, setItem() {} } });
  root = dom.document.querySelector<HTMLElement>("#hub")!;
});
afterEach(() => { cleanup?.(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const click = (key: string) => root.querySelector<HTMLButtonElement>(`[data-flow="${key}"], [data-action="${key}"]`)!.click();
const checkout: WorktreeCheckout = { checkoutId: "checkout-child", repositoryId: "repo", workspaceId: "child", parentWorkspaceId: "atlas", path: "/fixture/child", branch: "feature/mobile", detached: false, main: false, ownership: "uatu", availability: "present", registered: true, running: false, locked: false };
const inventory: WorktreeInventory = { repositoryId: "repo", sourceWorkspaceId: "atlas", status: "ready", checkouts: [checkout], refs: { local: ["main"], remote: [], fetchedAt: null } };
const refusal: WorktreeOperationResult = { ok: false, kind: "create", operationId: "operation-partial", phase: "registering", retainedCheckout: { ...checkout, registered: false, workspaceId: undefined }, error: { code: "registration-failed", message: "Registration failed; checkout retained", retry: "retry-registration" } };

async function mount(overrides: Partial<MobileWorktrees> = {}) {
  const model = createSyntheticBackend();
  const api: MobileWorktrees = { inventory: async () => ({ status: "available", value: inventory }), fetch: async () => ({ status: "completed", value: { ok: false, refs: { ...inventory.refs, local: ["release"] }, error: { code: "fetch-network", message: "Fetch refused", retry: "retry-fetch" } } }), create: async () => ({ status: "completed", value: refusal }), open: async () => ({ status: "completed", value: refusal }), register: async () => ({ status: "completed", value: refusal }), forget: async () => ({ status: "completed", value: refusal }), preflightDelete: async () => ({ status: "completed", value: { ok: false, error: { code: "ownership-required", message: "External checkout cannot be deleted", retry: "none" } } }), delete: async () => ({ status: "completed", value: refusal }), ...overrides };
  const ui = mountMobileHub(root, { ...model.backend, worktrees: api, async readWorkspace(id) { const result = await model.backend.readWorkspace(id); return result.status === "available" ? { ...result, value: { ...result.value, createWorktree: true } } : result; } }, { navigateWorkspace() {}, returnToWorkspace() {}, setRoute() {} }); cleanup = ui.destroy;
  await ui.ready; ui.show("hub", { kind: "workspace", id: "atlas" }); await settle();
  click("worktrees"); await settle();
  return { ui, model, api };
}

test("an open inventory consumes existing invalidations without manual Refresh or a Hub detail remount", async () => {
  let reads = 0;
  let current = inventory;
  const { ui } = await mount({ inventory: async () => { reads++; return { status: "available", value: current }; } });
  const heading = root.querySelector(".mh-flow-page h1");
  expect(reads).toBe(1);
  current = { ...inventory, checkouts: [...inventory.checkouts, { ...checkout, checkoutId: "external", branch: "external/new" }] };
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  await ui.refresh(); await settle();
  expect(root.textContent).toContain("external/new");
  expect(reads).toBe(2);
  expect(root.querySelector(".mh-flow-page h1")).toBe(heading);
});

test.each(["editor", "detail"] as const)("returning from %s re-reads invalidations missed while it was inactive", async child => {
  let reads = 0, current = inventory;
  await mount({ inventory: async () => { reads++; return { status: "available", value: current }; } });
  click(child === "editor" ? "create" : "checkout-0");
  const childRoot = root.querySelector(child === "editor" ? ".mh-task" : ".mh-flow-page h1");
  const draft = root.querySelector<HTMLInputElement>('[name="branch"]');
  if (draft) draft.value = "do-not-discard-while-editing";
  current = { ...inventory, checkouts: [{ ...checkout, branch: "changed-during-detour" }] };
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  expect(reads).toBe(1); expect(childRoot?.isConnected).toBe(true);
  if (draft) expect(draft.value).toBe("do-not-discard-while-editing");
  click(child === "editor" ? "cancel-sheet" : "flow-back"); await settle();
  expect(reads).toBe(2); expect(root.textContent).toContain("changed-during-detour");
});

for (const child of ["editor", "detail"] as const) test.each(["success", "failure", "throw"] as const)(`${child} resume fences an earlier refresh's late %s`, async outcome => {
  let reads = 0;
  let resolve!: (result: import("./backend").ReadResult<WorktreeInventory>) => void, reject!: (error: Error) => void;
  await mount({ inventory: async () => {
    reads++;
    if (reads === 2) return new Promise((done, fail) => { resolve = done; reject = fail; });
    return { status: "available", value: reads === 1 ? inventory : { ...inventory, checkouts: [{ ...checkout, branch: "fresh-after-resume" }] } };
  } });
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  expect(reads).toBe(2);
  click(child === "editor" ? "create" : "checkout-0");
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  expect(reads).toBe(2);
  click(child === "editor" ? "cancel-sheet" : "flow-back"); await settle();
  expect(reads).toBe(3); expect(root.textContent).toContain("fresh-after-resume");
  const heading = root.querySelector(".mh-flow-page h1");
  if (outcome === "throw") reject(new Error("Obsolete refresh failure"));
  else resolve(outcome === "success" ? { status: "available", value: { ...inventory, checkouts: [{ ...checkout, branch: "obsolete-checkout" }] } } : { status: "unavailable", problem: { kind: "unavailable", message: "Obsolete refresh failure" } });
  await settle();
  expect(root.querySelector(".mh-flow-page h1")).toBe(heading);
  expect(root.textContent).toContain("fresh-after-resume");
  expect(root.textContent).not.toContain("obsolete-checkout"); expect(root.textContent).not.toContain("Obsolete refresh failure");
});

test("burst invalidations serialize reads, discard superseded payloads and cannot replace a creation draft", async () => {
  let reads = 0, watching = 0;
  let resolve!: (result: import("./backend").ReadResult<WorktreeInventory>) => void;
  let live!: () => void;
  await mount({
    inventory: async () => { reads++; if (reads === 1) return { status: "available", value: inventory }; return new Promise(done => { resolve = done; }); },
    watchInventory: (_source, invalidated) => { watching++; live = invalidated; return () => { watching--; }; },
  });
  expect(watching).toBe(1);
  live(); live(); window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  expect(reads).toBe(2);
  live(); live();
  resolve({ status: "available", value: { ...inventory, checkouts: [{ ...checkout, branch: "superseded" }] } }); await settle();
  expect(root.textContent).not.toContain("superseded"); expect(reads).toBe(3);
  click("create");
  const task = root.querySelector(".mh-task"), draft = root.querySelector<HTMLInputElement>('[name="branch"]')!;
  draft.value = "keep-this-draft";
  expect(watching).toBe(0);
  live(); window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  resolve({ status: "available", value: { ...inventory, checkouts: [] } }); await settle();
  expect(reads).toBe(3); expect(root.querySelector(".mh-task")).toBe(task); expect(draft.value).toBe("keep-this-draft");
});

test("a superseded failed refresh cannot retire the observer before the newer inventory is read", async () => {
  let reads = 0;
  let resolve!: (result: import("./backend").ReadResult<WorktreeInventory>) => void;
  await mount({ inventory: async () => {
    reads++;
    if (reads === 2) return new Promise(done => { resolve = done; });
    return { status: "available", value: reads === 1 ? inventory : { ...inventory, checkouts: [{ ...checkout, branch: "newer-facts" }] } };
  } });
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  resolve({ status: "unavailable", problem: { kind: "unavailable", message: "Obsolete failure" } }); await settle();
  expect(reads).toBe(3); expect(root.textContent).toContain("newer-facts"); expect(root.textContent).not.toContain("Obsolete failure");
});

test("the existing Hub refresh revalidates only the mounted inventory, never an active editor", async () => {
  let reads = 0;
  const { ui } = await mount({ inventory: async () => ({ status: "available", value: ++reads === 1 ? inventory : { ...inventory, checkouts: [{ ...checkout, branch: "other-repository-update" }] } }) });
  await ui.refresh(); await settle();
  expect(reads).toBe(2); expect(root.textContent).toContain("other-repository-update");
  click("create");
  const task = root.querySelector(".mh-task");
  await ui.refresh(); await settle();
  expect(reads).toBe(2); expect(root.querySelector(".mh-task")).toBe(task);
});

test("superseding an inventory read never suppresses authoritative unauthorized recovery", async () => {
  let reads = 0, watching = 0;
  let resolve!: (result: import("./backend").ReadResult<WorktreeInventory>) => void;
  await mount({
    inventory: async () => { reads++; if (reads === 1) return { status: "available", value: inventory }; return new Promise(done => { resolve = done; }); },
    watchInventory: () => { watching++; return () => { watching--; }; },
  });
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  resolve({ status: "unavailable", problem: { kind: "unauthorized", message: "Session revoked" } }); await settle();
  expect(watching).toBe(0); expect(reads).toBe(2);
  expect(root.querySelector(".mh-login")).not.toBeNull(); expect(root.textContent).not.toContain(checkout.path);
});

test.each(["leave", "invalidate", "destroy"] as const)("%s releases live inventory and fences its late response", async boundary => {
  let reads = 0, watching = 0;
  let resolve!: (result: import("./backend").ReadResult<WorktreeInventory>) => void;
  const { ui, model } = await mount({
    inventory: async () => { reads++; if (reads === 1) return { status: "available", value: inventory }; return new Promise(done => { resolve = done; }); },
    watchInventory: () => { watching++; return () => { watching--; }; },
  });
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated")); await settle();
  expect(reads).toBe(2);
  if (boundary === "leave") ui.show("settings");
  else if (boundary === "destroy") ui.destroy();
  else await model.backend.signOut();
  await settle(); expect(watching).toBe(0);
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  resolve({ status: "available", value: { ...inventory, checkouts: [{ ...checkout, branch: "late-secret-checkout" }] } }); await settle();
  expect(root.textContent).not.toContain("late-secret-checkout"); expect(reads).toBe(2);
});

test.each(["missing", "replaced"] as const)("%s checkout exposes facts and safe forget but never Open or Register", async availability => {
  await mount({ inventory: async () => ({ status: "available", value: { ...inventory, checkouts: [{ ...checkout, availability, ownership: "uncertain" }] } }) });
  click("checkout-0");
  expect(root.textContent).toContain(availability);
  expect(root.querySelector('[data-flow="open"]')).toBeNull();
  expect(root.querySelector('[data-flow="register"]')).toBeNull();
  expect(root.querySelector('[data-flow="forget"]')).not.toBeNull();
  click("delete"); await settle();
  expect(root.textContent).toContain("Worktree deletion refused");
  expect(root.querySelector('[data-action="commit-sheet"]')).toBeNull();
});

test("fetch refusal preserves exact refs and draft; partial create names retained checkout and never claims completion", async () => {
  let intent: unknown;
  await mount({ create: async input => { intent = input; return { status: "completed", value: refusal }; } });
  click("create");
  root.querySelector<HTMLInputElement>('[name="branch"]')!.value = "phone";
  click("fetch"); await settle();
  expect(root.textContent).toContain("Fetch refused");
  expect(root.querySelector<HTMLInputElement>('[name="branch"]')!.value).toBe("phone");
  // Disappearing selection must not silently substitute release.
  expect(root.querySelector<HTMLSelectElement>('[name="base"]')!.querySelector('option[selected]')?.getAttribute("value")).toBe("");
  Object.defineProperty(root.querySelector('[name="base"]')!, "value", { configurable: true, value: "local:release" });
  Object.defineProperty(root.querySelector('[name="mode"]')!, "value", { configurable: true, value: "new-branch" });
  click("commit-sheet"); await settle();
  expect(intent).toMatchObject({ branch: "phone", base: { kind: "local", ref: "release" } });
  expect(root.textContent).toContain("Worktree operation refused");
  expect(root.textContent).toContain("Retained checkout — do not create a replacement");
  expect(root.textContent).toContain("operation-partial");
  expect(root.textContent).not.toContain("Worktree operation completed");
});
