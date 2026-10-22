import { expect, spyOn, test } from "bun:test";
import { parseHTML } from "linkedom";
import { compactWorkers, type CompactWorker } from "./compact-work";
import { CompactWorkersView } from "./compact-workers-view";

test("finished worker clocks render 24-hour evening and midnight even under an AM/PM locale", () => {
  const { document, window } = parseHTML('<html><body><div id="workers"></div></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  // Force an AM/PM locale while retaining the host timezone and the view's
  // real formatting options. Local date construction makes this timezone-neutral.
  const format = spyOn(Date.prototype, "toLocaleTimeString").mockImplementation(function(this: Date, _locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat("en-US", options).format(this);
  });
  try {
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host);
    const evening = new Date(2026, 9, 22, 19, 43).getTime();
    const midnight = new Date(2026, 9, 23, 0, 0).getTime();
    view.paint("parent", compactWorkers([
      { type: "background_task", id: "evening", taskId: "evening", description: "Finished", status: "completed", createdAt: evening - 60_000, usage: { durationMs: 60_000, totalTokens: 0, toolUses: 0 } },
      { type: "background_task", id: "midnight", taskId: "midnight", description: "Start only", status: "completed", createdAt: midnight },
      { type: "background_task", id: "unknown", taskId: "unknown", description: "No timestamp", status: "completed", createdAt: 0 },
    ]), new Set(), true);
    expect(host.querySelector('[data-worker-id="evening"] .chat-worker-meta')!.textContent).toBe("Agent · 19:43");
    expect(host.querySelector('[data-worker-id="midnight"] .chat-worker-meta')!.textContent).toBe("Agent · Started 00:00");
    expect(host.querySelector('[data-worker-id="unknown"] .chat-worker-meta')!.textContent).toBe("Agent");
  } finally {
    format.mockRestore();
    for (const [key, value] of previous) Reflect.set(globalThis, key, value);
  }
});

test("running and finished workers share one flat list and a single compact header", () => {
  const { document, window } = parseHTML('<html><body><details open><summary>1 working · 1 finished</summary><div id="workers"></div></details></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  try {
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host);
    view.paint("parent", compactWorkers([
      { type: "background_task", id: "done", taskId: "done", description: "Finished task", status: "completed", createdAt: 1 },
      { type: "background_task", id: "live", taskId: "live", description: "Running task", status: "running", createdAt: 2 },
    ]), new Set(), true);
    expect(host.querySelectorAll("details, summary").length).toBe(0);
    expect(host.querySelectorAll("ul").length).toBe(1);
    expect([...host.querySelectorAll("li")].map(row => row.dataset.workerId)).toEqual(["live", "done"]);
    expect(host.parentElement!.querySelector("summary .chat-workers-dismiss")).not.toBeNull();
  } finally { for (const [key, value] of previous) Reflect.set(globalThis, key, value); }
});

test("finished dismissal is view-only and exposes no Restore control", () => {
  const { document, window } = parseHTML('<html><body><details><summary>Workers</summary><div id="workers"></div></details></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  try {
    let choices = 0;
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host, () => choices++);
    const workers = compactWorkers([{ type: "background_task", id: "done", taskId: "done", description: "Finished task", status: "completed", createdAt: 1 }]);
    view.paint("parent", workers, new Set(), true);
    const button = host.parentElement!.querySelector<HTMLButtonElement>(".chat-workers-dismiss")!;
    expect(button.textContent).toBe("Dismiss finished"); button.click();
    view.paint("parent", [], new Set(), true);
    expect(button.hidden).toBe(true);
    expect(host.textContent).not.toContain("Restore finished");
    expect(choices).toBe(1);
    expect(workers[0]?.state).toBe("completed");
  } finally { for (const [key, value] of previous) Reflect.set(globalThis, key, value); }
});

test("a worker Stop becoming disabled returns owned keyboard focus to inspection", () => {
  const { document, window } = parseHTML('<html><body><details open><summary>Workers</summary><div id="workers"></div></details></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document);
  Reflect.set(globalThis, "Element", window.Element);
  let focused: Element | null = null;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  try {
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host);
    const workers = compactWorkers([{ type: "background_task", id: "execution", taskId: "native", description: "Worker", taskType: "agent", createdAt: 1, status: "running" }]);
    view.paint("parent", workers, new Set(), true);
    const inspect = host.querySelector<HTMLButtonElement>(".chat-worker-inspect")!;
    const stop = host.querySelector<HTMLButtonElement>("[data-stop-task]")!;
    inspect.focus = () => { focused = inspect; };
    focused = stop;
    view.paint("parent", workers, new Set(["native"]), true);
    expect(stop.disabled).toBe(true);
    expect(focused).toBe(inspect);
  } finally {
    for (const [key, value] of previous) Reflect.set(globalThis, key, value);
  }
});

test("keyed worker rows and actions survive arbitrary sibling insertion, removal and reordering", () => {
  const { document, window } = parseHTML('<html><body><details open><summary>Workers</summary><div id="workers"></div></details></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  let focused: Element | null = null;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  try {
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host);
    const worker = (id: string): CompactWorker => ({ id, name: id, taskId: id, stoppable: true, state: "working", kind: "agent", references: [], since: 0, settledAt: 0 });
    view.paint("parent", [worker("a"), worker("b"), worker("c")], new Set(), true);
    const row = host.querySelector('[data-worker-id="b"]')!;
    const inspect = row.querySelector(".chat-worker-inspect")!;
    const stop = row.querySelector("[data-stop-task]")!;
    focused = stop;
    for (const ids of [["c", "b", "a"], ["b", "a", "c"], ["a", "c", "b"], ["d", "b", "a"], ["b"], ["a", "b", "c"]]) {
      view.paint("parent", ids.map(worker), new Set(), true);
      expect([...host.querySelectorAll("li")].map(node => node.dataset.workerId)).toEqual(ids);
      expect(host.querySelector('[data-worker-id="b"]')).toBe(row);
      expect(row.querySelector(".chat-worker-inspect")).toBe(inspect);
      expect(row.querySelector("[data-stop-task]")).toBe(stop);
      expect(stop.hasAttribute("disabled")).toBe(false);
    }
  } finally { for (const [key, value] of previous) Reflect.set(globalThis, key, value); }
});

test.each(["unknown", "stopping", "completed", "removed", "dismiss"] as const)("worker focus fallback uses preventScroll when %s", transition => {
  const { document, window } = parseHTML('<html><body><details open><summary>Workers</summary><div id="workers"></div></details></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  let focused: Element | null = null;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  try {
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host);
    const worker: CompactWorker = { id: "worker", taskId: "native", stoppable: true, name: "Worker", kind: "agent", state: transition === "dismiss" ? "completed" : "working", references: [], since: 0, settledAt: 0 };
    view.paint("parent", [worker], new Set(), true);
    const inspect = host.querySelector<HTMLButtonElement>(".chat-worker-inspect")!;
    const stop = host.querySelector<HTMLButtonElement>("[data-stop-task]");
    const header = host.parentElement!.querySelector<HTMLElement>("summary")!;
    const dismiss = header.querySelector<HTMLButtonElement>(".chat-workers-dismiss")!;
    const fallback = transition === "removed" || transition === "dismiss" ? header : inspect;
    const focus = spyOn(fallback, "focus").mockImplementation(() => { focused = fallback; });
    focused = transition === "dismiss" ? dismiss : stop;
    view.paint("parent", transition === "removed" || transition === "dismiss" ? [] : [{ ...worker, state: transition === "stopping" ? "working" : transition }], transition === "stopping" ? new Set(["native"]) : new Set(), true);
    expect(focused).toBe(fallback);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    if (transition === "unknown" || transition === "stopping") expect(stop!.disabled).toBe(true);
    if (transition === "completed" || transition === "removed") expect(stop!.isConnected).toBe(false);
    if (transition === "dismiss") expect(dismiss.hidden).toBe(true);
    focus.mockRestore();
  } finally { for (const [key, value] of previous) Reflect.set(globalThis, key, value); }
});
