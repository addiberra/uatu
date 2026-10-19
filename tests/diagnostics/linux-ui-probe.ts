import type { Page } from "@playwright/test";
import { appendFile } from "node:fs/promises";

/** Test-context only. Delegates to native descriptors/methods unchanged. */
export async function installScrollProbe(page: Page, path: string) {
  let writes = Promise.resolve();
  await page.exposeBinding("__uatuScrollProbeEmit", (_source, sample: unknown) => {
    writes = writes.then(() => appendFile(path, `${JSON.stringify(sample)}\n`));
    return writes;
  });
  await page.addInitScript(() => {
    const ids = ["chat-timeline", "chat-work-dock", "chat-compact-workers-items", "chat-queue-content"];
    const samples: unknown[] = [];
    const identify = (n: Element | null) => n?.id || n?.tagName || null;
    const snapshot = (event: string, target?: Element | null, extra: object = {}) => {
      if (samples.length >= 2500) return;
      const sample = { time: performance.now(), event, target: identify(target ?? null), active: identify(document.activeElement),
        mode: document.documentElement.dataset.uiMode,
        work: document.querySelector("#chat-work-dock")?.getAttribute("data-work-active"),
        workersOpen: document.querySelector<HTMLDetailsElement>("#chat-compact-workers")?.open,
        pendingExpanded: document.querySelector("[data-pending-toggle]")?.getAttribute("aria-expanded"),
        unseen: document.querySelector("#chat-latest")?.getAttribute("hidden"),
        transcriptRows: document.querySelector("#chat-items")?.childElementCount,
        boxes: ids.flatMap(id => { const n = document.getElementById(id); return n ? [{ id, top: n.scrollTop, height: n.clientHeight, extent: n.scrollHeight, box: n.getBoundingClientRect().toJSON() }] : []; }), ...extra };
      samples.push(sample);
      void (window as unknown as { __uatuScrollProbeEmit: (sample: unknown) => Promise<void> }).__uatuScrollProbeEmit(sample).catch(() => {});
    };
    const stack = () => (new Error().stack ?? "").split("\n").slice(1, 9).map(line => line.replace(/https?:\/\/[^\s)]+/g, url => { try { return new URL(url).pathname; } catch { return "<url>"; } })).join("\n");
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    if (!descriptor?.get || !descriptor.set) throw new Error("Native scrollTop descriptor unavailable");
    Object.defineProperty(Element.prototype, "scrollTop", { ...descriptor, set(value) {
      const watched = ids.includes(this.id);
      if (watched) snapshot("scrollTop-write-before", this, { value, stack: stack() });
      descriptor.set!.call(this, value);
      if (watched) snapshot("scrollTop-write-after", this);
    } });
    for (const method of ["scrollTo", "scrollBy", "scrollIntoView"] as const) {
      const native = Element.prototype[method];
      Object.defineProperty(Element.prototype, method, { configurable: true, writable: true, value: function (...args: unknown[]) {
        if (ids.includes(this.id) || this.closest?.("#chat-work-dock, #chat-timeline")) snapshot(method, this, { stack: stack() });
        return Reflect.apply(native, this, args);
      } });
    }
    for (const type of ["scroll", "pointerdown", "pointerup", "click", "toggle", "focusin", "focusout", "keydown"]) document.addEventListener(type, event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("#chat-work-dock, #chat-timeline")) snapshot(type, target);
    }, true);
    document.addEventListener("DOMContentLoaded", () => {
      const timeline = document.getElementById("chat-timeline");
      const dock = document.getElementById("chat-work-dock");
      const observer = new ResizeObserver(() => snapshot("resize-observer"));
      if (timeline) observer.observe(timeline);
      if (dock) observer.observe(dock);
      const items = document.getElementById("chat-items");
      if (items) {
        observer.observe(items);
        new MutationObserver(() => snapshot("transcript-mutation")).observe(items, { subtree: true, childList: true, characterData: true });
      }
      if (dock) new MutationObserver(() => snapshot("dock-mutation")).observe(dock, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "open", "hidden", "aria-expanded", "data-work-active", "data-work-content-expanded"] });
    });
    Object.assign(window, { __uatuCausalSamples: samples, __uatuCausalMark: (label: string) => snapshot(`checkpoint:${label}`) });
  });
  return () => writes;
}

export async function scrollCheckpoint(page: Page, label: string) {
  return page.evaluate(label => {
    const probe = window as unknown as { __uatuCausalMark: (label: string) => void; __uatuCausalSamples: unknown[] };
    probe.__uatuCausalMark(label);
    return probe.__uatuCausalSamples.at(-1);
  }, label);
}

/** No text, values, URLs or storage: only layout and native-control state. */
export async function headerGeometry(page: Page) {
  return page.evaluate(() => {
    const properties = ["display", "position", "box-sizing", "width", "min-width", "max-width", "inline-size", "flex", "flex-basis", "flex-shrink", "flex-wrap", "grid-template-columns", "justify-content", "overflow-x", "white-space", "overflow-wrap", "font", "font-family", "font-size", "line-height", "appearance", "padding-left", "padding-right", "gap", "visibility", "clip", "clip-path"];
    return { viewport: innerWidth, fonts: document.fonts.status, active: document.activeElement?.id,
      nodes: [...document.querySelectorAll<HTMLElement>("#chat-surface, .chat-header, .chat-identity, .chat-conversation-controls, .chat-conversation-controls > *")].map(n => {
        const css = getComputedStyle(n), range = document.createRange(); range.selectNodeContents(n);
        return { id: n.id || n.className || n.tagName, hidden: n.hidden, box: n.getBoundingClientRect().toJSON(), client: n.clientWidth, scroll: n.scrollWidth,
          styles: Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)])),
          contentRects: [...range.getClientRects()].slice(0, 12).map(rect => rect.toJSON()),
          named: !!(n.getAttribute("aria-label") || (n instanceof HTMLSelectElement && n.labels?.length)),
          nativeSelect: n instanceof HTMLSelectElement ? { options: n.options.length, selectedIndex: n.selectedIndex, disabled: n.disabled } : undefined };
      }) };
  });
}

/** Intrinsic measurement clones exist only in the isolated synthetic page. */
export async function nativeIntrinsicWidths(page: Page) {
  return page.evaluate(() => ["chat-conversation-select", "chat-new-conversation"].map(id => {
    const node = document.getElementById(id)!;
    const css = getComputedStyle(node), clone = node.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id"); clone.setAttribute("aria-hidden", "true"); clone.tabIndex = -1;
    clone.style.cssText = [...css].map(key => `${key}:${css.getPropertyValue(key)}`).join(";");
    clone.style.cssText += ";position:absolute;inset:0 auto auto 0;visibility:hidden;min-width:0;max-width:none;flex:none";
    document.body.append(clone);
    try {
      clone.style.width = "min-content"; const minContent = clone.getBoundingClientRect().width;
      clone.style.width = "max-content"; const maxContent = clone.getBoundingClientRect().width;
      return { id, minContent, maxContent, font: css.font, appearance: css.appearance };
    } finally { clone.remove(); }
  }));
}
