import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";

test("disposed navigation releases its owners and cannot affect a replacement controller", async () => {
  const { window, document } = parseHTML(await Bun.file(`${import.meta.dir}/../index.html`).text());
  const body = document.body.innerHTML;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  let now = 0;
  let sequence = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const timerCallbacks: (() => void)[] = [];
  const advance = (milliseconds: number) => {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].run();
    }
    now = end;
  };
  // Keep observer callbacks even after disconnect, to simulate already-queued
  // deliveries. They must not read or mutate a disposed controller's DOM.
  const observers: { connected: boolean; run: () => void }[] = [];
  class Observer {
    entry: { connected: boolean; run: () => void };
    constructor(run: () => void) { this.entry = { connected: false, run }; observers.push(this.entry); }
    observe() { this.entry.connected = true; }
    disconnect() { this.entry.connected = false; }
  }
  const media = Object.assign(document.createElement("div"), { matches: false });
  const viewport = Object.assign(document.createElement("div"), { offsetTop: 0, offsetLeft: 0, width: 390, height: 1000 });
  let active: Element | null = null;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => active ?? document.body });
  const prototype = window.HTMLElement.prototype;
  const focus = Object.getOwnPropertyDescriptor(prototype, "focus");
  Object.defineProperty(prototype, "focus", { configurable: true, value(this: Element) { active = this; } });

  const recorded = new Map<EventTarget, Set<EventListenerOrEventListenerObject>>();
  const restoreTargets: (() => void)[] = [];
  const track = (target: EventTarget) => {
    const entries = new Set<EventListenerOrEventListenerObject>();
    recorded.set(target, entries);
    const addDescriptor = Object.getOwnPropertyDescriptor(target, "addEventListener");
    const removeDescriptor = Object.getOwnPropertyDescriptor(target, "removeEventListener");
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    target.addEventListener = (type, listener, options) => { if (listener) entries.add(listener); add.call(target, type, listener, options); };
    target.removeEventListener = (type, listener, options) => { if (listener) entries.delete(listener); remove.call(target, type, listener, options); };
    restoreTargets.push(() => {
      if (addDescriptor) Object.defineProperty(target, "addEventListener", addDescriptor);
      else Reflect.deleteProperty(target, "addEventListener");
      if (removeDescriptor) Object.defineProperty(target, "removeEventListener", removeDescriptor);
      else Reflect.deleteProperty(target, "removeEventListener");
    });
  };
  const decorate = () => {
    const bar = document.getElementById("touch-tab-bar")!;
    const handle = document.getElementById("navigation-handle")!;
    const dialog = document.getElementById("navigation-preferences-dialog")!;
    let reads = 0;
    let captured = false;
    Object.defineProperties(handle, {
      offsetWidth: { value: 44 }, offsetHeight: { value: 44 },
      setPointerCapture: { value: () => { captured = true; } },
      hasPointerCapture: { value: () => captured },
      releasePointerCapture: { value: () => { captured = false; } },
    });
    Object.defineProperties(bar, {
      offsetHeight: { value: 60 },
      getClientRects: { value: () => [{}] },
      getBoundingClientRect: { value: () => { reads++; return { top: 920, bottom: 980, width: 374, height: 60 }; } },
    });
    for (const select of dialog.querySelectorAll<HTMLSelectElement>("select")) {
      Object.defineProperty(select, "value", { configurable: true, writable: true, value: "left" });
    }
    const elements = [bar, handle, dialog];
    const targets = [bar, handle, ...bar.querySelectorAll<HTMLElement>("button, a"), dialog, ...dialog.querySelectorAll<HTMLElement>("input, select")];
    for (const element of targets) track(element);
    return {
      bar, handle, dialog, elements, targets,
      reads: () => reads,
      captured: () => captured,
      snapshot: () => elements.map(element => element.outerHTML),
    };
  };
  let dispose = () => {};
  let stopBounds = () => {};
  let restoreState = () => {};
  try {
    for (const name of ["window", "document", "Node", "Element", "HTMLElement", "HTMLButtonElement", "Event"] as const) {
      replace(name, name === "window" ? window : Reflect.get(window, name));
    }
    replace("localStorage", storage);
    replace("sessionStorage", storage);
    replace("innerWidth", 390);
    replace("innerHeight", 1000);
    replace("visualViewport", viewport);
    replace("matchMedia", (query: string) => query.includes("coarse") ? { matches: true } : media);
    replace("getComputedStyle", () => ({ paddingTop: "0px", paddingRight: "0px", paddingBottom: "0px", paddingLeft: "0px" }));
    replace("ResizeObserver", Observer);
    replace("MutationObserver", Observer);
    replace("requestAnimationFrame", (run: () => void) => { run(); return 0; });
    replace("setTimeout", (run: () => void, delay: number) => {
      timerCallbacks.push(run);
      timers.set(++sequence, { at: now + delay, run });
      return sequence;
    });
    replace("clearTimeout", (id: number) => { timers.delete(id); });
    for (const target of [document, window, viewport, media]) track(target);

    const navigation = await import("./tab-bar");
    const preferences = await import("./navigation-preferences");
    const mode = await import("./ui-mode");
    const { appState } = await import("./state");
    const previous = { mode: mode.uiMode(), tab: appState.activeTab, surface: appState.activeSurface, preferences: preferences.getNavigationPreferences() };
    restoreState = () => {
      mode.setUiMode(previous.mode);
      appState.activeTab = previous.tab;
      appState.activeSurface = previous.surface;
      preferences.setNavigationPreferences(previous.preferences);
    };
    mode.setUiMode("touch");
    preferences.setNavigationPreferences({ autoHide: true });
    let bounds = 0;
    stopBounds = navigation.onNavigationOverlayBoundsChange(() => { bounds++; });
    const windowListeners = recorded.get(window)!.size; // Preference owner may retain its storage listener.
    const old = decorate();
    const disposeOld = navigation.initTabBar();
    dispose = disposeOld;
    navigation.navigationWorkspaceReady();
    expect(timers.size).toBe(1); // Seven-second idle timer.
    expect(observers.filter(observer => observer.connected)).toHaveLength(2);
    const staleTimers = [...timerCallbacks];
    disposeOld();
    expect(timers.size).toBe(0);
    expect(observers.every(observer => !observer.connected)).toBe(true);
    for (const target of [document, viewport, media, ...old.targets]) expect(recorded.get(target)?.size).toBe(0);
    expect(recorded.get(window)!.size).toBe(windowListeners);
    const before = { dom: old.snapshot(), reads: old.reads(), bounds };

    const signal = () => {
      for (const type of ["pointerdown", "pointerup", "pointercancel", "focusin", "focusout", "close", "beforeinput", "keydown", "keyup", "visibilitychange"]) document.dispatchEvent(new Event(type));
      for (const type of ["resize", "blur", "pageshow"]) window.dispatchEvent(new Event(type));
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
      media.dispatchEvent(new Event("change"));
    };
    signal();
    await Promise.resolve();
    for (const observer of observers) observer.run();
    for (const run of staleTimers) run();
    preferences.setNavigationPreferences({ side: "right", position: 0.2 });
    mode.setUiMode("desktop");
    mode.setUiMode("touch");
    navigation.navigationWorkspaceReady();
    advance(8000);
    expect({ dom: old.snapshot(), reads: old.reads(), bounds }).toEqual(before);
    expect(timers.size).toBe(0);

    document.body.innerHTML = body;
    active = null;
    const replacement = decorate();
    const disposeReplacement = navigation.initTabBar();
    dispose = disposeReplacement;
    navigation.navigationWorkspaceReady();
    expect(replacement.handle.dataset.side).toBe("right");
    preferences.setNavigationPreferences({ side: "left" });
    expect(replacement.handle.dataset.side).toBe("left");
    viewport.width = 360;
    viewport.dispatchEvent(new Event("resize"));
    expect(replacement.bar.style.width).toBe("344px");
    document.getElementById("touch-tab-files")!.click();
    expect(navigation.activeTab()).toBe("files");
    expect(document.getElementById("touch-tab-files")!.getAttribute("aria-selected")).toBe("true");
    // Retiring an old owner again must not erase the new owner's callbacks.
    disposeOld();
    expect(navigation.navigationOverlayBounds()).not.toBeNull();
    expect(old.snapshot()).toEqual(before.dom);

    document.getElementById("navigation-close")!.click();
    const press = new Event("pointerdown", { bubbles: true });
    Object.assign(press, { button: 0, pointerId: 7, clientX: 10, clientY: 250 });
    replacement.handle.dispatchEvent(press);
    expect(timers.size).toBe(2); // Fade and long press.
    expect(replacement.captured()).toBe(true);
    // Re-initializing itself retires the previous owner, even before its
    // caller invokes the returned disposer. Its capture/timers cannot leak.
    document.body.innerHTML = body;
    active = null;
    const current = decorate();
    dispose = navigation.initTabBar();
    expect(timers.size).toBe(0);
    expect(replacement.captured()).toBe(false);
    navigation.navigationWorkspaceReady();
    const retired = replacement.snapshot();
    disposeReplacement();
    expect(navigation.navigationOverlayBounds()).not.toBeNull();
    advance(7001);
    expect(current.bar.dataset.open).toBe("false");
    advance(280);
    expect(current.bar.hidden).toBe(true);
    current.handle.click();
    expect(current.bar.dataset.open).toBe("true");
    expect(replacement.snapshot()).toEqual(retired);
    expect(old.snapshot()).toEqual(before.dom);
  } finally {
    dispose();
    stopBounds();
    restoreState();
    for (const restore of restoreTargets.reverse()) restore();
    if (focus) Object.defineProperty(prototype, "focus", focus);
    else Reflect.deleteProperty(prototype, "focus");
    for (const [name, descriptor] of [...saved].reverse()) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
