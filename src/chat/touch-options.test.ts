import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { createTouchChatOptions } from "./touch-options";

test("compact touch uses the same options control in the header, not the suppressed composer actions", async () => {
  const { document, window } = parseHTML(await Bun.file(`${import.meta.dir}/../index.html`).text());
  const saved = new Map(["document", "window", "HTMLElement", "MutationObserver", "ResizeObserver"].map(key => [key, Reflect.get(globalThis, key)]));
  let disconnected = 0;
  class Observer { observe() {} disconnect() { disconnected++; } }
  for (const [key, value] of Object.entries({ document, window, HTMLElement: window.HTMLElement, MutationObserver: undefined, ResizeObserver: Observer })) Reflect.set(globalThis, key, value);
  document.documentElement.dataset.uiMode = "touch";
  document.documentElement.setAttribute("data-chat-compact", "");
  let dispose: (() => void) | undefined;
  try {
    const toggle = document.getElementById("chat-options-toggle")!;
    dispose = createTouchChatOptions(() => {});
    expect(document.getElementById("chat-header-options")!.contains(toggle)).toBe(true);
    expect(document.querySelectorAll("#chat-options-toggle")).toHaveLength(1);
    expect(document.getElementById("chat-options-content")!.contains(document.getElementById("chat-attach"))).toBe(true);
    window.dispatchEvent(new window.Event("pagehide"));
    expect(disconnected).toBe(0);
  } finally {
    dispose?.();
    for (const [key, value] of saved) Reflect.set(globalThis, key, value);
  }
  expect(disconnected).toBe(1);
});
