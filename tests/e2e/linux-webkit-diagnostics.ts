import { appendFile, mkdir } from "node:fs/promises";
import type { BrowserContext, TestInfo } from "@playwright/test";

// Explicitly opt-in from the temporary diagnostic job only. No production
// instrumentation, text, form values, URLs, headers, or storage are collected.
export async function recordLinuxWebKitDiagnostics(context: BrowserContext, info: TestInfo, label: string): Promise<() => Promise<void>> {
  const geometry = info.outputPath(`${label}-layout.jsonl`);
  await mkdir(info.outputDir, { recursive: true });
  let writes = Promise.resolve();
  let records = 0;
  await context.exposeBinding("__uatuLinuxLayout", (_source, sample: unknown) => {
    if (records++ >= 3_000) return;
    writes = writes.then(() => appendFile(geometry, `${JSON.stringify(sample)}\n`));
    return writes;
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.addInitScript(() => {
    const ids = ["chat-surface", "chat-conversation-select", "chat-new-conversation", "chat-rename-conversation", "chat-work-dock", "chat-compact-workers", "chat-compact-workers-items", "chat-queue", "chat-queue-content", "chat-queue-note", "chat-timeline", "chat-composer"];
    let count = 0, lastLayout = -Infinity, queued = false;
    const identify = (node: Element | null) => node ? node.id || `${node.tagName}.${[...node.classList].slice(0, 2).join(".")}` : null;
    const record = (event: string, target: EventTarget | null) => {
      if (count++ >= 3_000 || !document.querySelector("#chat-surface")) return;
      const nodes = ids.flatMap(id => {
        const node = document.getElementById(id);
        return node ? [node] : [];
      });
      const selectors = ".chat-header, .chat-conversation-controls, #chat-compact-workers > summary, [data-pending-toggle], .chat-queue-batch button";
      nodes.push(...document.querySelectorAll<HTMLElement>(selectors));
      const boxes = nodes.map(node => {
        const box = node.getBoundingClientRect(), css = getComputedStyle(node);
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + Math.min(1, box.height / 2));
        return { id: identify(node), box: box.toJSON(), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, scrollLeft: node.scrollLeft,
          display: css.display, overflow: css.overflow, font: css.font, minWidth: css.minWidth, minHeight: css.minHeight, flex: css.flex, whiteSpace: css.whiteSpace, open: node instanceof HTMLDetailsElement ? node.open : undefined,
          topHit: identify(hit), ownsTop: node.contains(hit) };
      });
      const header = document.querySelector(".chat-header");
      const overflowing = header ? [...header.querySelectorAll<HTMLElement>("*")].filter(node => node.scrollWidth > node.clientWidth + 1).slice(0, 20).map(node => ({ id: identify(node), client: node.clientWidth, scroll: node.scrollWidth, box: node.getBoundingClientRect().toJSON(), overflow: getComputedStyle(node).overflowX })) : [];
      const emit = (window as unknown as { __uatuLinuxLayout: (sample: unknown) => Promise<void> }).__uatuLinuxLayout;
      void emit({ time: performance.now(), event, target: target instanceof Element ? identify(target) : null, active: identify(document.activeElement), viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height }, boxes, overflowing }).catch(() => {});
    };
    const afterLayout = (reason: string) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        queued = false; lastLayout = performance.now(); record(reason, null);
      }));
    };
    for (const event of ["pointerdown", "pointerup", "click", "toggle", "scroll", "focusin", "focusout"]) document.addEventListener(event, e => {
      record(event, e.target);
      afterLayout("after-native-event");
    }, true);
    window.addEventListener("resize", () => record("resize", null));
    document.addEventListener("DOMContentLoaded", () => {
      record("loaded", null);
      new MutationObserver(() => {
        if (queued || performance.now() - lastLayout < 100) return;
        afterLayout("layout-mutation");
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "open", "hidden", "aria-expanded", "data-work-content-expanded", "data-work-active", "data-work-cramped"] });
    });
  });
  let finished = false;
  return async () => {
    if (finished) return;
    finished = true;
    try {
      const trace = info.outputPath(`${label}-trace.zip`);
      await context.tracing.stop({ path: trace });
      await info.attach(`${label}-trace`, { path: trace, contentType: "application/zip" });
    } finally {
      await writes;
      if (records) await info.attach(`${label}-layout`, { path: geometry, contentType: "application/x-ndjson" });
    }
  };
}
