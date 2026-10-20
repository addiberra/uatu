import { test as base, expect } from "../e2e/fixtures";
import { withEngineBrowsers } from "../e2e/page-diagnostics";
import { headerGeometry, installScrollProbe, scrollCheckpoint } from "./linux-ui-probe";
import { enlargedPendingFixture } from "../e2e/enlarged-pending-fixture";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { appendFile, writeFile } from "node:fs/promises";

const test = withEngineBrowsers(base);
test.describe.configure({ retries: 0, timeout: 150_000 });

async function attach(info: TestInfo, name: string, data: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}
async function boot(page: Page, request: APIRequestContext) {
  expect((await request.post("/__e2e/reset")).ok()).toBe(true);
  expect((await request.post("/__e2e/chat", { data: { action: "agents", stack: "opencode-v2", backgroundPreview: true } })).ok()).toBe(true);
  const { token } = await request.get("/__e2e/terminal-token").then(r => r.json());
  await page.goto(`/?t=${encodeURIComponent(token)}`);
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await page.locator("#touch-tab-chat").tap();
  await page.getByRole("button", { name: "New conversation", exact: true }).tap();
  await expect(page.locator("#chat-conversation-select")).not.toHaveValue("");
  await page.locator("#chat-input").fill("Check independent action access");
  await page.locator("#chat-send").tap();
  await expect(page.locator("#chat-stop")).toBeEnabled();
  return page.locator("#chat-conversation-select").inputValue();
}
async function queue(page: Page, text: string) {
  await page.locator("#chat-input").fill(text);
  const accepted = page.waitForResponse(r => r.url().endsWith("/prompts") && r.request().method() === "POST");
  await page.locator("#chat-input").press("Alt+Enter");
  expect((await accepted).ok()).toBe(true);
}
async function painted(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ animations: "disabled" });
}
function engine(info: TestInfo): "webkit" | "chromium" {
  // Only the separate local harness substitutes Chromium; Linux config pins WebKit.
  return info.project.metadata.causalEngine === "chromium" ? "chromium" : "webkit";
}

test("Linux causality probe: painted header DOM subtraction", async ({ launchBrowser, baseURL, request }, info) => {
  test.setTimeout(90_000);
  const browser = await launchBrowser(engine(info));
  const observations: unknown[] = [];
  const verdicts: unknown[] = [];
  const stream = info.outputPath("header-subtraction.jsonl");
  await writeFile(stream, "");
  type Geometry = Awaited<ReturnType<typeof headerGeometry>>;
  const mismatch = (before: Geometry, after: Geometry, sameFixture: boolean) => {
    const reasons: string[] = [];
    // Keep exact synthetic text: a displayed timestamp crossing a minute is
    // a real baseline mismatch, not something to normalize into attribution.
    for (const key of ["shape", "options", "selectedIndex", "queue"] as const) {
      if (JSON.stringify(before.state[key]) !== JSON.stringify(after.state[key])) reasons.push(key);
    }
    if (sameFixture && (before.state.selected !== after.state.selected || !after.state.originalNodes)) reasons.push("native selection or original node identity");
    if (before.nodes.length !== after.nodes.length) reasons.push("node count");
    for (let i = 0; i < before.nodes.length; i++) {
      const a = before.nodes[i]!, b = after.nodes[i];
      if (!b || a.id !== b.id) { reasons.push(`node ${i}`); continue; }
      if (JSON.stringify(a.styles) !== JSON.stringify(b.styles)) reasons.push(`${a.id}:styles`);
      if (["x", "y", "width", "height"].some(key => Math.abs(a.box[key] - b.box[key]) > 1) || Math.abs(a.scroll - b.scroll) > 1 || Math.abs(a.client - b.client) > 1) reasons.push(`${a.id}:geometry`);
    }
    return reasons;
  };
  const record = async (page: Page, width: number, fixture: string, stage: string, captured?: Geometry) => {
    if (stage.endsWith(":painted") || stage.endsWith(":restored-painted")) {
      await page.screenshot({ path: info.outputPath(`${width}-${fixture}-${stage.replace(/:/g, "-")}.png`), animations: "disabled" });
    }
    const geometry = captured ?? await headerGeometry(page);
    const surface = geometry.nodes.find(n => n.id === "chat-surface")!;
    const sample = { width, fixture, stage, overflow: surface.scroll > surface.client + 1, geometry };
    observations.push(sample);
    await appendFile(stream, `${JSON.stringify(sample)}\n`);
    return sample;
  };
  try {
    for (const width of [390, 320]) {
      const targets = [
        ["heading", "#chat-title"],
        ["label", ".chat-conversation-controls > label"],
        ["select", "#chat-conversation-select"],
        ["rename", "#chat-rename-conversation"],
        ["new", "#chat-new-conversation"],
        ["collapse", "#chat-collapse"],
      ];
      let reference: Geometry | undefined;
      // No intervention shares a page/context with an earlier intervention.
      for (const [name, selector] of [...targets, ["select-same-width-button", "#chat-conversation-select"], ["cumulative", ""]]) {
        const page = await browser.newPage({ baseURL, viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
        try {
        await enlargedPendingFixture(page, request, width, "light");
        await painted(page);
        await page.locator("#chat-queue-content").evaluate(n => { n.scrollTop = 100; });
        await painted(page);
        // Keep the actual nodes, listeners, options and insertion positions.
        // Deliberately inaccessible temporary removals are diagnostic only.
        await page.evaluate(() => {
          const saved: Array<{ node: Element; marker: Comment; replacement?: Element }> = [];
          const originals = [...document.querySelectorAll(".chat-header, .chat-header *")];
          const originalChildren = originals.map(n => [...n.childNodes]);
          Object.assign(window, { __headerSubtract: (selector: string, replace: boolean) => {
            const node = document.querySelector<HTMLElement>(selector)!;
            const sourceBox = node.getBoundingClientRect().toJSON();
            const marker = document.createComment("diagnostic insertion point");
            let replacement: HTMLElement | undefined;
            if (replace) {
              const css = getComputedStyle(node), box = node.getBoundingClientRect();
              replacement = document.createElement("button");
              replacement.textContent = (node as HTMLSelectElement).selectedOptions[0]?.textContent || "Conversation";
              for (const property of Array.from(css)) replacement.style.setProperty(property, css.getPropertyValue(property));
              replacement.style.setProperty("box-sizing", "border-box", "important");
              for (const property of ["width", "min-width", "max-width"]) replacement.style.setProperty(property, `${box.width}px`, "important");
              replacement.style.setProperty("height", `${box.height}px`, "important");
              replacement.style.setProperty("flex", `0 0 ${box.width}px`, "important");
              replacement.dataset.headerProbeReplacement = "true";
            }
            node.replaceWith(marker);
            if (replacement) marker.after(replacement);
            saved.push({ node, marker, replacement });
            return { selector, replace, removed: !node.isConnected, sourceBox };
          }, __headerRestore: () => {
            for (const { node, marker, replacement } of saved.reverse()) {
              replacement?.remove(); marker.replaceWith(node);
            }
            saved.length = 0;
          }, __headerIdentity: () => originals.every((node, i) => node.isConnected && node.childNodes.length === originalChildren[i]!.length && [...node.childNodes].every((child, j) => child === originalChildren[i]![j])) });
        });
        const before = await record(page, width, name, "baseline:painted");
        reference ??= before.geometry;
        const baselineMismatch = mismatch(reference, before.geometry, false);
        const replacementChecks: boolean[] = [];
        const checkReplacement = (geometry: Geometry) => {
          if (name !== "select-same-width-button") return;
          const source = before.geometry.nodes.find(n => n.id === "chat-conversation-select")!.box;
          const replacement = geometry.nodes.find(n => n.probeReplacement)!.box;
          const delta = Math.max(Math.abs(source.width - replacement.width), Math.abs(source.height - replacement.height));
          replacementChecks.push(delta <= 1);
          expect.soft(delta, `${width}px ${name}: replacement dimensions differ from original`).toBeLessThanOrEqual(1);
        };
        const steps = name === "cumulative" ? targets : [[name, selector]];
        let after: Awaited<ReturnType<typeof record>> | undefined;
        for (const [step, target] of steps) {
          const immediate = await headerGeometry(page, { selector: target, replace: name === "select-same-width-button" });
          await record(page, width, name, `${step}:immediate`, immediate);
          checkReplacement(immediate);
          await painted(page);
          after = await record(page, width, name, `${step}:painted`);
          checkReplacement(after.geometry);
        }
        const restoredImmediate = await headerGeometry(page, { restore: true });
        await record(page, width, name, "restore:immediate", restoredImmediate);
        await painted(page);
        const restored = await record(page, width, name, "restore:restored-painted");
        const restoreMismatch = mismatch(before.geometry, restored.geometry, true);
        const valid = baselineMismatch.length === 0 && restoreMismatch.length === 0 && replacementChecks.every(Boolean);
        const verdict = { width, fixture: name, baselineMismatch, restoreMismatch, replacementChecks, valid,
          baselineOverflow: before.overflow, restoredOverflow: restored.overflow,
          causalClearance: valid && before.overflow && !after!.overflow && restored.overflow };
        verdicts.push(verdict);
        await appendFile(stream, `${JSON.stringify({ verdict })}\n`);
        } finally { await page.close(); }
      }
    }
  } finally {
    await attach(info, "header-subtraction", { engine: engine(info), meaning: "fresh real fixture/context for every intervention and cumulative sweep; immediate mutation/measurement share a browser task; baseline mismatch or failed restoration invalidates attribution; only overflowing painted baselines and restored recurrence support causality; passing collection is not a fix", verdicts, observations });
    await info.attach("header-subtraction-stream", { path: stream, contentType: "application/x-ndjson" });
    await browser.close();
  }
});

test("Linux causality probe: disclosure transcript reset", async ({ launchBrowser, baseURL, request }, info) => {
  const browser = await launchBrowser(engine(info));
  const rounds: Array<{ round: number; checkpoints: unknown[]; samples: unknown[] }> = [];
  // Five independent original fixtures; explicit 150s ceiling, no retries.
  for (let round = 0; round < 5; round++) {
    const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    await page.addInitScript(() => Object.defineProperty(window, "visualViewport", { configurable: true, value: Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 }) }));
    const streamPath = info.outputPath(`scroll-causality-round-${round}.jsonl`);
    await writeFile(streamPath, "");
    const flush = await installScrollProbe(page, streamPath);
    const checkpoints: unknown[] = [];
    try {
      const conversationId = await test.step(`round ${round}: boot real fixture`, () => boot(page, request));
      checkpoints.push(await scrollCheckpoint(page, "booted"));
      for (let i = 0; i < 12; i++) expect((await request.post("/__e2e/chat", { data: { action: "opencode", op: "launchWorker", conversationId } })).ok()).toBe(true);
      checkpoints.push(await scrollCheckpoint(page, "workers-launched"));
      for (let i = 0; i < 10; i++) {
        await queue(page, `Follow-up ${i}`);
        await expect(page.locator(".chat-queued-message")).toHaveCount(i + 1);
      }
      const workers = page.locator("#chat-compact-workers > summary"), pending = page.locator("[data-pending-toggle]");
      await workers.tap(); await pending.tap();
      const offsets = () => page.evaluate(() => Object.fromEntries(["chat-compact-workers-items", "chat-queue-content", "chat-work-dock", "chat-timeline"].map(id => [id, document.getElementById(id)!.scrollTop])));
      await page.locator("#chat-compact-workers-items").evaluate(n => n.scrollTop = 140);
      await page.locator("#chat-queue-content").evaluate(n => n.scrollTop = 140);
      checkpoints.push(await scrollCheckpoint(page, "original-before"));
      const before = await offsets();
      for (const [name, control] of [["pending", pending], ["workers", workers]] as const) {
        await control.tap(); checkpoints.push(await scrollCheckpoint(page, `${name}:closed`));
        if (name === "pending") await expect(pending).toHaveAttribute("aria-expanded", "false");
        else await expect(page.locator("#chat-compact-workers")).not.toHaveAttribute("open");
        await control.tap(); checkpoints.push(await scrollCheckpoint(page, `${name}:reopened`));
        if (name === "pending") await expect(pending).toHaveAttribute("aria-expanded", "true");
        else await expect(page.locator("#chat-compact-workers")).toHaveAttribute("open", "");
        let preserved = true;
        try { await expect.poll(offsets).toEqual(before); } catch { preserved = false; }
        checkpoints.push({ stage: `${name}:original-offset-verdict`, preserved, before, after: await offsets() });
        checkpoints.push(await scrollCheckpoint(page, `${name}:after-original-poll`));
      }
      await painted(page); checkpoints.push(await scrollCheckpoint(page, "original-sequence:painted"));
      // A control comparison, not a replacement for the original native taps.
      await workers.focus(); await workers.press("Enter"); await workers.press("Enter");
      await painted(page); checkpoints.push(await scrollCheckpoint(page, "keyboard:painted"));
    } finally {
      // A timed-out page may already be closed. The streamed JSONL still
      // survives; never replace the original error with a cleanup evaluate.
      const samples = await page.evaluate(() => (window as unknown as { __uatuCausalSamples?: unknown[] }).__uatuCausalSamples ?? []).catch(() => []);
      rounds.push({ round, checkpoints, samples });
      await attach(info, `scroll-causality-round-${round}`, { engine: engine(info), instrumentation: "native delegating setters/methods and geometry observers may affect timing", maxSamples: 2500, capped: samples.length >= 2500, round: rounds.at(-1) });
      await page.close();
      await flush();
      await info.attach(`scroll-causality-stream-${round}`, { path: streamPath, contentType: "application/x-ndjson" });
    }
  }
  await attach(info, "scroll-causality-summary", { engine: engine(info), meaning: "collection only; inspect checkpoints and write stacks, not test status", rounds: rounds.map(({ round, checkpoints }) => ({ round, checkpoints })) });
});
