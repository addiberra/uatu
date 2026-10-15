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
