import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { compactWorkers } from "./compact-work";
import { CompactWorkersView } from "./compact-workers-view";

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
