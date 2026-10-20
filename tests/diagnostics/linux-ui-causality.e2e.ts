import { test as base, expect } from "../e2e/fixtures";
import { withEngineBrowsers } from "../e2e/page-diagnostics";
import { headerGeometry, installScrollProbe, scrollCheckpoint } from "./linux-ui-probe";
import { enlargedPendingFixture } from "../e2e/enlarged-pending-fixture";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

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
async function painted(page: Page) { await page.screenshot({ animations: "disabled" }); }
function engine(info: TestInfo): "webkit" | "chromium" {
  // Only the separate local harness substitutes Chromium; Linux config pins WebKit.
  return info.project.metadata.causalEngine === "chromium" ? "chromium" : "webkit";
}

test("Linux causality probe: native header intrinsic widths", async ({ launchBrowser, baseURL, request }, info) => {
  test.setTimeout(60_000);
  const browser = await launchBrowser(engine(info));
  const observations: unknown[] = [];
  try {
    for (const width of [390, 320]) {
      // Every intervention gets a fresh *real* failing fixture. Baselines are
      // live route state, not an isolated clone with different native options.
      const variants = [
        ["control", ""],
        ["focus-only", ""],
        ["reselect-only", ""],
        ["native-width-invalidation", ""],
        ["label-anchor", ".chat-conversation-controls {position:relative!important} .chat-conversation-controls > label {inset:0 auto auto 0!important}"],
        ["select-inline-containment", "#chat-conversation-select {contain:inline-size!important}"],
        ["grid-definite-select", ".chat-conversation-controls {display:grid!important;grid-auto-flow:column;grid-template-columns:minmax(0,1fr);grid-auto-columns:auto} #chat-conversation-select {width:100%!important;max-width:100%!important;box-sizing:border-box}"],
      ];
      for (const [name, css] of variants) {
        const page = await browser.newPage({ baseURL, viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
        try {
          await enlargedPendingFixture(page, request, width, "light");
          // Match the failing assertion's preceding paints and pane scroll.
          await painted(page);
          await page.locator("#chat-queue-content").evaluate(n => { n.scrollTop = 100; });
          await painted(page);
          const before = await headerGeometry(page);
          const picker = page.getByRole("combobox", { name: "Conversation", exact: true });
          const selected = await picker.inputValue();
          const events: string[] = [];
          page.on("request", r => { if (/\/api\/chat\//.test(r.url()) && r.method() !== "GET") events.push(r.method()); });
          await page.evaluate(() => {
            Object.assign(window, { headerProbeEvents: [] });
            for (const type of ["input", "change"]) document.querySelector("#chat-conversation-select")!.addEventListener(type, () => (window as unknown as { headerProbeEvents: string[] }).headerProbeEvents.push(type));
          });
          if (name === "focus-only") await picker.focus();
          else if (name === "reselect-only") await picker.selectOption(selected);
          else if (name === "native-width-invalidation") await picker.evaluate(node => {
            const old = node.style.width;
            node.style.width = `${node.getBoundingClientRect().width}px`;
            void node.offsetWidth;
            node.style.width = old;
          });
          else if (css) await page.addStyleTag({ content: css });
          const immediate = await headerGeometry(page);
          await painted(page);
          const after = await headerGeometry(page);
          observations.push({ width, name, before, immediate, after,
            baselineOverflow: before.nodes.find(n => n.id === "chat-surface")!.scroll > width,
            sameSelection: selected === await picker.inputValue(), mutations: events,
            controlEvents: await page.evaluate(() => (window as unknown as { headerProbeEvents: string[] }).headerProbeEvents) });
        } finally { await page.close(); }
      }
    }
  } finally {
    await attach(info, "header-causality", { engine: engine(info), meaning: "fresh live enlarged-pending fixture per intervention; only overflowing baselines support causal conclusions", observations });
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
