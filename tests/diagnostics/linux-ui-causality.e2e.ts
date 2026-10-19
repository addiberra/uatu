import { test as base, expect } from "../e2e/fixtures";
import { withEngineBrowsers } from "../e2e/page-diagnostics";
import { headerGeometry, installScrollProbe, nativeIntrinsicWidths, scrollCheckpoint } from "./linux-ui-probe";
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
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const observations: unknown[] = [];
  try {
    await boot(page, request);
    await queue(page, "Synthetic queued text\nSecond readable line");
    await page.locator("[data-pending-toggle]").tap();
    observations.push({ stage: "before-font-ready", geometry: await headerGeometry(page) });
    await page.evaluate(() => document.fonts.ready.then(() => { document.documentElement.style.fontSize = "200%"; }));
    observations.push({ stage: "enlarged-before-paint", geometry: await headerGeometry(page) });
    // Clone real markup and stylesheets into a separate synthetic document.
    // No experimental stylesheet ever touches the app or its reading state.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await painted(page);
      const actual = await headerGeometry(page);
      const fixture = await page.evaluate(() => {
        const root = document.querySelector("#chat-surface")!;
        // Only the real header subtree is copied, including native options and labels.
        // Do NOT inline computed widths: doing so would freeze auto/intrinsic sizing.
        const surface = root.cloneNode(false) as HTMLElement;
        surface.append(root.querySelector(".chat-header")!.cloneNode(true));
        const styles = [...document.querySelectorAll("link[rel='stylesheet'], style")].map(node => {
          const clone = node.cloneNode(true) as HTMLElement;
          if (node instanceof HTMLLinkElement) clone.setAttribute("href", node.href);
          return clone.outerHTML;
        }).join("\n");
        const attributes = (node: Element) => [...node.attributes].map(attr => [attr.name, attr.value]);
        return { surface: surface.outerHTML, styles, viewport: document.querySelector('meta[name="viewport"]')?.outerHTML ?? "", html: attributes(document.documentElement), body: attributes(document.body) };
      });
      const isolated = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      try {
        // Same fixture origin avoids null-origin/private-network stylesheet
        // restrictions. This intercepted document runs no application script.
        await isolated.route("**/__causal_header", route => route.fulfill({ contentType: "text/html", body: `<html><head>${fixture.viewport}${fixture.styles}</head><body>${fixture.surface}</body></html>` }));
        await isolated.goto(`${baseURL}/__causal_header`);
        await isolated.evaluate(fixture => {
          for (const [name, value] of fixture.html) document.documentElement.setAttribute(name!, value!);
          for (const [name, value] of fixture.body) document.body.setAttribute(name!, value!);
          return document.fonts.ready.then(() => {});
        }, fixture);
        await painted(isolated);
        const baseline = await headerGeometry(isolated);
        const intrinsicWidths = await nativeIntrinsicWidths(isolated);
        const comparable = actual.nodes.filter(n => ["chat-surface", "chat-header", "chat-conversation-controls", "chat-conversation-select", "chat-new-conversation"].includes(n.id)).map(n => {
          const copied = baseline.nodes.find(other => other.id === n.id);
          return { id: n.id, clientDelta: copied ? copied.client - n.client : null, scrollDelta: copied ? copied.scroll - n.scroll : null };
        });
        const overrides = [
          ["select-min-width", "#chat-conversation-select {min-width:0!important}"],
          ["select-flex-shrink", "#chat-conversation-select {flex-shrink:1!important}"],
          ["parent-min-width", ".chat-conversation-controls {min-width:0!important}"],
          ["parent-flex-shrink", ".chat-conversation-controls {flex-shrink:1!important}"],
          ["select-inline-size", "#chat-conversation-select {inline-size:100%!important}"],
          ["select-max-inline-size", "#chat-conversation-select {max-inline-size:100%!important}"],
          ["select-box-sizing", "#chat-conversation-select {box-sizing:border-box!important}"],
          ["parent-wrap", ".chat-conversation-controls {flex-wrap:wrap!important}"],
          ["button-min-width", "#chat-new-conversation {min-width:0!important}"],
          ["button-white-space", "#chat-new-conversation {white-space:normal!important}"],
          ["button-overflow-wrap", "#chat-new-conversation {overflow-wrap:anywhere!important}"],
          ["parent-position", ".chat-conversation-controls {position:relative!important}"],
          ["label-inset", ".chat-conversation-controls label {inset:0 auto auto 0!important}"],
          ["native-appearance-control", "#chat-conversation-select {appearance:none!important}"],
        ];
        const variants: unknown[] = [];
        // Retain completed observations even if a later native operation times out.
        const observation = { width, actual, baseline, comparable, baselineEquivalent: comparable.every(n => n.clientDelta !== null && n.scrollDelta !== null && Math.abs(n.clientDelta) <= 1 && Math.abs(n.scrollDelta) <= 1), intrinsicWidths, variants, nativeSelection: undefined as unknown };
        observations.push(observation);
        for (const [name, css] of overrides) {
          const style = await isolated.addStyleTag({ content: css! });
          await painted(isolated);
          variants.push({ name, geometry: await headerGeometry(isolated) });
          await style.evaluate(n => n.remove());
          await painted(isolated);
          variants.push({ name: `${name}:reset`, geometry: await headerGeometry(isolated) });
        }
        const picker = isolated.getByRole("combobox", { name: "Conversation", exact: true });
        await expect(picker).toBeVisible();
        await picker.focus();
        await expect(picker).toBeFocused();
        // selectOption uses the native select, preserving its selected value.
        const selected = await picker.inputValue();
        await picker.selectOption(selected);
        observation.nativeSelection = await headerGeometry(isolated);
      } finally { await isolated.close(); }
    }
  } finally {
    await attach(info, "header-causality", { engine: engine(info), meaning: "collection only; no resolution assertion", observations });
    await page.close();
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
