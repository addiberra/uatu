import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { compactWorkers } from "./compact-work";
import { CompactWorkersView } from "./compact-workers-view";

test("finished dismissal and restoration are view actions, never worker mutation", () => {
  const { document, window } = parseHTML('<html><body><div id="workers"></div></body></html>');
  const previous = new Map(["document", "Element"].map(key => [key, Reflect.get(globalThis, key)]));
  Reflect.set(globalThis, "document", document); Reflect.set(globalThis, "Element", window.Element);
  try {
    const choices: boolean[] = [];
    const host = document.getElementById("workers")! as unknown as HTMLElement;
    const view = new CompactWorkersView(host, restore => choices.push(restore));
    const workers = compactWorkers([{ type: "background_task", id: "done", taskId: "done", description: "Finished task", status: "completed", createdAt: 1 }]);
    view.paint("parent", workers, new Set(), true);
    const button = host.querySelector<HTMLButtonElement>(".chat-workers-dismiss")!;
    expect(button.textContent).toBe("Dismiss finished"); button.click();
    view.paint("parent", [], new Set(), true, 1);
    expect(button.textContent).toBe("Restore finished (1)"); button.click();
    expect(choices).toEqual([false, true]);
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
