import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { createFlowEnvironment, showContextualError, validateField, displayName } from "./flow-ui";
import type { MobileHubBackend, OperationResult } from "./backend";
import { bindAuthenticationHost, readConfiguration } from "./onboarding-flows";
import { createSyntheticBackend } from "../../../tests/mobile-hub-review/backend";

test("Clone configuration identifies an invalid host inside the optional disclosure", async () => {
  const { document } = parseHTML('<html><body><section><details><div data-auth-row><select name="authentication"><option selected value="ssh-open">SSH</option></select><label>Host<input name="host" value=""></label></div></details><p class="mh-flow-error" role="alert"></p></section></body></html>');
  const root = document.querySelector("section")! as unknown as HTMLElement;
  const credentials = await createSyntheticBackend().backend.readCredentials();
  if (credentials.status !== "available") throw Error("Fixture unavailable");
  expect(() => readConfiguration(root, credentials.value, { displayName: "Draft", folderName: "draft", authentication: [], signing: "", start: false, init: false })).toThrow("Enter an authentication host.");
  expect(root.querySelector('[name="host"]')?.getAttribute("aria-invalid")).toBe("true");
});

test("field errors keep hints and values, clear only their own corrected error", () => {
  const { document, window } = parseHTML('<html><body><section><label>Name<input name="name" aria-describedby="hint" value=" "></label><p id="hint">Existing hint</p><p class="mh-flow-error" role="alert"></p></section></body></html>');
  const root = document.querySelector("section")! as unknown as HTMLElement;
  const input = root.querySelector<HTMLInputElement>("input")!;
  expect(() => validateField(root, "name", displayName)).toThrow("Display name is required.");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const ids = input.getAttribute("aria-describedby")!.split(" ");
  expect(ids[0]).toBe("hint");
  expect(document.getElementById(ids[1]!)?.textContent).toBe("Display name is required.");
  showContextualError(root, "A different operation failed.");
  input.value = "Corrected"; input.dispatchEvent(new window.Event("input", { bubbles: true }));
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  expect(input.getAttribute("aria-describedby")).toBe("hint");
  expect(root.querySelector("[role=alert]")?.textContent).toBe("A different operation failed.");
});

test("a new Rename validation failure updates its existing description and error ownership", () => {
  const { document, window } = parseHTML('<html><body><section><label>Name<input name="name" value=" "></label><p class="mh-sheet-error" role="alert"></p></section></body></html>');
  const root = document.querySelector("section")! as unknown as HTMLElement;
  const input = root.querySelector<HTMLInputElement>("input")!;
  expect(() => validateField(root, "name", displayName)).toThrow("Display name is required.");
  const id = input.getAttribute("aria-describedby")!;
  input.value = "a".repeat(65); input.dispatchEvent(new window.Event("input"));
  expect(() => validateField(root, "name", displayName)).toThrow("Use 1–64 visible characters");
  expect(input.getAttribute("aria-describedby")).toBe(id);
  expect(document.getElementById(id)?.textContent).toBe("Use 1–64 visible characters for the display name.");
  showContextualError(root, "Use 1–64 visible characters for the display name.");
  input.value = "Corrected"; input.dispatchEvent(new window.Event("input"));
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  expect(root.querySelector("[role=alert]")?.textContent).toBe("");
});

test("selecting None clears obsolete authentication-host validation immediately", async () => {
  const { document, window } = parseHTML('<html><body><section class="mh-flow-page"><div data-auth-row><select name="authentication"><option selected value="ssh-open">SSH</option><option value="">None</option></select><label>Host<input name="host" value=""></label></div><p class="mh-flow-error" role="alert"></p></section></body></html>');
  const root = document.querySelector("section")! as unknown as HTMLElement;
  const result = await createSyntheticBackend().backend.readCredentials();
  if (result.status !== "available") throw Error("Fixture unavailable");
  const draft = { displayName: "Draft", folderName: "draft", authentication: [], signing: "", start: false, init: false };
  bindAuthenticationHost(root, result.value);
  expect(() => readConfiguration(root, result.value, draft)).toThrow("Enter an authentication host.");
  showContextualError(root, "Enter an authentication host.");
  const select = root.querySelector("select")!;
  select.querySelector("option")!.removeAttribute("selected"); select.lastElementChild!.setAttribute("selected", "");
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  const host = root.querySelector<HTMLInputElement>('[name="host"]')!;
  expect(host.disabled).toBe(true); expect(host.hasAttribute("aria-invalid")).toBe(false);
  expect(host.hasAttribute("aria-describedby")).toBe(false);
  expect(root.querySelector("[role=alert]")?.textContent).toBe("");
  expect(readConfiguration(root, result.value, draft).authentication).toEqual([]);
});

for (const kind of ["flow", "sheet"]) test(`${kind} action error reveals only its scroll owner without focusing or replacing the draft`, () => {
  const { document } = parseHTML(`<html><body><section><div class="mh-${kind === "flow" ? "flow-content" : "sheet-body"}"><input value="draft"><p class="mh-${kind}-error" role="alert"></p></div></section></body></html>`);
  const region = document.querySelector("section")! as unknown as HTMLElement;
  const pane = region.firstElementChild as HTMLElement;
  const input = region.querySelector("input")!;
  const alert = region.querySelector<HTMLElement>("[role=alert]")!;
  let focused = false; input.focus = () => { focused = true; };
  pane.scrollTop = 0;
  pane.getBoundingClientRect = () => ({ top: 0, bottom: 300 }) as DOMRect;
  alert.getBoundingClientRect = () => ({ top: 1000, bottom: 1040 }) as DOMRect;
  showContextualError(region, "Invalid input");
  expect(pane.scrollTop).toBe(0);
  showContextualError(region, "Invalid input", { reveal: true });
  expect(pane.scrollTop).toBe(740);
  expect(region.querySelector("input")).toBe(input);
  expect(input.value).toBe("draft");
  expect(focused).toBe(false);
  expect(region.querySelectorAll("[role=alert]").length).toBe(1);
  region.remove(); showContextualError(region, "stale", { reveal: true });
  expect(alert.textContent).toBe("Invalid input");
});

test("a replaced mutation context does not reveal an old failure in the next form", async () => {
  const { document } = parseHTML('<html><body><section><p class="mh-flow-error" role="alert"></p></section></body></html>');
  const root = document.querySelector("section")! as unknown as HTMLElement;
  const owner = createFlowEnvironment(root, {} as MobileHubBackend, { open: () => root, close() {}, busy() {}, error() {} }, {
    user: () => "owner", home() {}, navigate() {}, changed() {}, authLost() {}, openWorkspace() {},
  });
  let resolve!: (result: OperationResult<never>) => void;
  const pending = owner.env.mutate(() => new Promise<OperationResult<never>>(done => { resolve = done; }), () => { throw new Error("unexpected success"); });
  root.innerHTML = '<p class="mh-flow-error" role="alert">Next form</p>';
  resolve({ status: "rejected", problem: { kind: "unavailable", message: "Old failure" } });
  await pending;
  expect(root.textContent).toBe("Next form");
});
