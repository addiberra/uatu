import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { infoRows } from "./information";
import { advisory, credentialSafetyNotice, dismissAdvisory, check, createFlowEnvironment, sharedUidKey, sharedUidWarning } from "./flow-ui";
import { createTaskView } from "./task-view";
import type { MobileHubBackend, OperationResult } from "./backend";

test("a reused page root fences departed reads and mutation cleanup from newer operations", async () => {
  const { document } = parseHTML("<html><body><main></main><aside></aside></body></html>");
  const root = document.querySelector("main")! as unknown as HTMLElement;
  const view = createTaskView(document.querySelector("aside")! as unknown as HTMLElement, () => true, () => {});
  const { env } = createFlowEnvironment(root, {} as MobileHubBackend, { ...view, error() {}, open: (title, body, primary, _cancel, presentation) => view.open(title, body, primary, presentation) }, { user: () => "fixture", home() {}, navigate() {}, changed() {}, authLost() {}, openWorkspace() {} });
  env.page("First", "");
  let first!: (value: OperationResult<unknown>) => void, second!: (value: OperationResult<unknown>) => void;
  let restored = false;
  const old = env.mutate<unknown>(() => new Promise(resolve => { first = resolve; }), () => { restored = true; });
  env.page("Second", "");
  const next = env.mutate<unknown>(() => new Promise(resolve => { second = resolve; }), () => {});
  first({ status: "completed", value: {} }); await old;
  expect(restored).toBe(false);
  expect(root.getAttribute("aria-busy")).toBe("true");
  second({ status: "completed", value: {} }); await next;
  expect(root.hasAttribute("aria-busy")).toBe(false);
  const captured = env.current();
  env.page("Third", "");
  expect(captured()).toBe(false);
});

test("facts are semantic, escaped and never controls", () => {
  const { document } = parseHTML(infoRows([{ label: "<Current>", value: "<secret>", detail: "Foot & note", mono: true, tone: "warning" }]));
  expect(document.querySelector("dt")?.textContent).toBe("<Current>");
  expect(document.querySelector("dd")?.textContent).toBe("<secret>Foot & note");
  expect(document.querySelectorAll("input,select,button").length).toBe(0);
  expect(document.querySelector(".mh-info-warning .mh-info-mono")).not.toBeNull();
});

test("switch markup preserves native checkbox draft and value semantics", () => {
  const { document } = parseHTML(check("consent", "Allow access", false, "allowed") + check("enabled", "Enabled", true));
  const input = document.querySelector("input")!;
  expect(input.getAttribute("role")).toBe("switch");
  expect(input.getAttribute("type")).toBe("checkbox");
  expect(input.getAttribute("value")).toBe("allowed");
  expect(input.hasAttribute("checked")).toBe(false);
  expect(document.querySelector('[name="enabled"]')?.hasAttribute("checked")).toBe(true);
});

test("inline named security notice dismisses in editors and stays dismissed per user", () => {
  const { document } = parseHTML("<html><body><main></main><aside></aside></body></html>");
  const root = document.querySelector("main")! as unknown as HTMLElement;
  const view = createTaskView(document.querySelector("aside")! as unknown as HTMLElement, () => true, () => {});
  const user = "information-test-editor";
  const { env } = createFlowEnvironment(root, {} as MobileHubBackend, { ...view, error() {}, open: (title, body, primary, _cancel, presentation) => view.open(title, body, primary, presentation) }, { user: () => user, home() {}, navigate() {}, changed() {}, authLost() {}, openWorkspace() {} });
  const task = env.task("Editor", advisory(user));
  expect(task.querySelector('aside[aria-label="Credential security"]')).not.toBeNull();
  expect(task.querySelectorAll('[data-flow="dismiss-advisory"]').length).toBe(1);
  task.querySelector<HTMLButtonElement>('[data-flow="dismiss-advisory"]')!.click();
  expect(task.querySelector("[data-shared-uid]")).toBeNull();
  expect(advisory(user)).not.toContain("data-shared-uid");
  expect(advisory(user)).toContain("Credential safety details");
  for (const fact of ["same-UID", "runtime files", "shared agents", "unset the configuration", "credentials assigned elsewhere"]) expect(advisory(user)).toContain(fact);
  expect(advisory("another-information-test-user")).not.toBe("");
  expect(sharedUidKey("user")).toBe("uatu.hub.notice.shared-uid-v1:dXNlcg");
});

test("overview safety is concise with all exact facts in an always-reachable native disclosure", () => {
  const user = "overview-disclosure-test";
  const { document } = parseHTML(`<main>${credentialSafetyNotice(user)}</main>`);
  const root = document.querySelector("main")! as unknown as HTMLElement;
  const detail = root.querySelector("details")!;
  expect(detail.hasAttribute("open")).toBe(false);
  expect(detail.querySelector("summary")?.textContent).toBe("Credential safety details");
  expect(root.querySelector("h2, .mh-advisory")).toBeNull();
  expect(root.querySelector("aside")?.textContent).toContain("Credentials are shared across workspaces on this Hub.");
  expect(detail.textContent).toContain(sharedUidWarning);
  for (const fact of ["Assignments choose defaults for tools.", "They do not prevent another workspace", "Do not run untrusted projects", "Disabling or deleting a provider token may stop running workspaces", "removing a running workspace's assignment requires stopping its shells first."]) expect(detail.textContent).toContain(fact);
  dismissAdvisory(user, root);
  expect(root.querySelector("aside")).toBeNull();
  expect(root.querySelector("details")).toBe(detail);
  expect(credentialSafetyNotice(user)).toContain("<summary>Credential safety details</summary>");
  expect(credentialSafetyNotice(user)).not.toContain("data-shared-uid");
  expect(advisory(user)).toContain(sharedUidWarning);
  expect(advisory(user)).toContain("<h2>Credential safety details</h2>");
});
