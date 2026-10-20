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

/** Synthetic fixture text/selection, layout and native-control state only;
 * never storage, authentication tokens or request URLs. */
export async function headerGeometry(page: Page, action?: { selector?: string; replace?: boolean; restore?: boolean }) {
  return page.evaluate(action => {
    const probe = window as unknown as {
      __headerSubtract: (selector: string, replace: boolean) => unknown;
      __headerRestore: () => unknown;
      __headerIdentity?: () => boolean;
    };
    // Mutation and layout measurement share one browser task: no assertion,
    // protocol round-trip or rendering opportunity between them.
    const mutation = action?.restore ? probe.__headerRestore() : action?.selector ? probe.__headerSubtract(action.selector, !!action.replace) : undefined;
    const properties = ["display", "position", "top", "right", "bottom", "left", "transform", "contain", "box-sizing", "width", "height", "min-width", "max-width", "inline-size", "flex", "flex-basis", "flex-shrink", "flex-wrap", "grid-template-columns", "justify-content", "overflow-x", "overflow-y", "white-space", "overflow-wrap", "font", "font-family", "font-size", "line-height", "appearance", "padding-left", "padding-right", "gap", "visibility", "clip", "clip-path"];
    const select = document.querySelector<HTMLSelectElement>("#chat-conversation-select");
    const state = {
      shape: [...document.querySelectorAll(".chat-header, .chat-header *")].map(n => ({ tag: n.tagName, id: n.id, class: n.getAttribute("class"), text: n.textContent, hidden: n.hasAttribute("hidden") })),
      selected: select?.value, selectedIndex: select?.selectedIndex,
      options: select ? [...select.options].map(n => n.textContent) : [],
      queue: ["chat-queue-content", "chat-work-dock", "chat-timeline"].map(id => { const n = document.getElementById(id)!; return { id, top: n.scrollTop, left: n.scrollLeft }; }),
      originalNodes: probe.__headerIdentity?.(),
    };
    return { mutation, state, viewport: innerWidth, fonts: document.fonts.status, active: document.activeElement?.id,
      nodes: [...document.querySelectorAll<HTMLElement>("#chat-surface, .chat-header, .chat-header *, #chat-input, #chat-queue textarea")].map(n => {
        const css = getComputedStyle(n), range = document.createRange(); range.selectNodeContents(n);
        const box = n.getBoundingClientRect();
        const hit = box.width && box.height && n.matches("button, select") ? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) : null;
        return { id: n.id || n.getAttribute("class") || n.tagName, hidden: n.hidden, box: n.getBoundingClientRect().toJSON(), client: n.clientWidth, scroll: n.scrollWidth,
          probeReplacement: n.hasAttribute("data-header-probe-replacement"),
          offsetParent: n.offsetParent ? { id: n.offsetParent.id || n.offsetParent.tagName, box: n.offsetParent.getBoundingClientRect().toJSON() } : null,
          centerHit: hit ? n.contains(hit) : null,
          styles: Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)])),
          contentRects: [...range.getClientRects()].slice(0, 12).map(rect => rect.toJSON()),
          named: !!(n.getAttribute("aria-label") || (n instanceof HTMLSelectElement && n.labels?.length)),
          nativeSelect: n instanceof HTMLSelectElement ? { options: n.options.length, selectedIndex: n.selectedIndex, disabled: n.disabled } : undefined };
      }) };
  }, action);
}
