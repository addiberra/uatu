import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { resetAppBasePathForTests } from "../../shared/app-url";
import { createLiveWorktrees } from "./live-worktrees";
import type { LiveTransport } from "./live-transport";

const keys = ["window", "document", "EventSource", "setInterval", "clearInterval"];
const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const timers = new Map<number, () => void>();
let stop: (() => void) | undefined, serial = 0, visibility = "visible";
beforeEach(() => {
  const dom = parseHTML('<html><head><meta name="uatu-base-path" content="/s/atlas/"></head><body></body></html>');
  Object.defineProperty(dom.document, "visibilityState", { configurable: true, get: () => visibility });
  const globals = { window: dom.window, document: dom.document,
    EventSource: class { constructor() { throw new Error("A retained inventory must not open a second stream"); } },
    setInterval: (callback: () => void) => { const id = ++serial; timers.set(id, callback); return id; },
    clearInterval: (id: number) => { timers.delete(id); },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  visibility = "visible"; resetAppBasePathForTests();
});
afterEach(() => {
  stop?.(); stop = undefined; timers.clear();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  resetAppBasePathForTests();
});
const watch = (source: string, invalidated: () => void) => createLiveWorktrees({} as LiveTransport).watchInventory!(source, invalidated);

test("retained A leaves its existing event relay and stream owner untouched", () => {
  let invalidations = 0;
  const relay = () => { invalidations++; };
  window.addEventListener("uatu:worktrees-invalidated", relay);
  stop = watch("atlas", () => { throw new Error("A already has the DOM relay"); });
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  stop();
  window.dispatchEvent(new window.Event("uatu:worktrees-invalidated"));
  expect(invalidations).toBe(2); expect(timers.size).toBe(0);
});

test("managed B reconciles only while visible and releases its timer and wake listeners", () => {
  let invalidations = 0;
  stop = watch("other", () => { invalidations++; });
  expect(timers.size).toBe(1);
  const tick = [...timers.values()][0]!;
  tick(); expect(invalidations).toBe(1);
  visibility = "hidden";
  tick(); window.dispatchEvent(new window.Event("online")); expect(invalidations).toBe(1);
  visibility = "visible";
  document.dispatchEvent(new window.Event("visibilitychange")); expect(invalidations).toBe(2);
  stop(); expect(timers.size).toBe(0);
  window.dispatchEvent(new window.Event("online")); document.dispatchEvent(new window.Event("visibilitychange"));
  expect(invalidations).toBe(2);
});
