import { test as base, expect } from "./fixtures";
import { withEngineBrowsers } from "./page-diagnostics";
import { openChatPanel } from "./chat-helpers";
import { captureScreenshot, saveEvidence } from "./evidence";

const test = withEngineBrowsers(base);

for (const engine of ["chromium", "webkit"] as const) for (const touch of [false, true]) {
  test(`reference work card owns its header and rows: ${engine} ${touch ? "phone" : "desktop"}`, async ({ launchBrowser, request, baseURL }, info) => {
    test.setTimeout(90_000);
    const browser = await launchBrowser(engine);
    const page = await browser.newPage({ baseURL, viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: touch, hasTouch: touch, reducedMotion: "reduce" });
    await page.addInitScript(touch => {
      const viewport = Object.assign(new EventTarget(), { height: touch ? 844 : 900, width: touch ? 390 : 1280, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    }, touch);
    try {
      await request.post("/__e2e/reset");
      await request.post("/__e2e/chat", { data: { action: "agents", stack: "opencode-v2", backgroundPreview: true } });
      const { token } = await request.get("/__e2e/terminal-token").then(r => r.json());
      await page.goto(`/?t=${encodeURIComponent(token)}`);
      await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
      if (touch) await page.locator("#touch-tab-chat").click(); else await openChatPanel(page);
      await page.getByRole("button", { name: "New conversation", exact: true }).click();
      await expect(page.locator("#chat-conversation-select")).not.toHaveValue("");
      await page.locator("#chat-input").fill("Implement the task model and check layout independently");
      await page.locator("#chat-send").click();
      await expect(page.locator("#chat-stop")).toBeEnabled();
      const conversationId = await page.locator("#chat-conversation-select").inputValue();
      for (let i = 0; i < 6; i++) {
        const worker = await request.post("/__e2e/chat", { data: { action: "opencode", op: "launchWorker", conversationId, background: i !== 0 } }).then(r => r.json());
        if (i >= 3) await request.post("/__e2e/chat", { data: { action: "opencode", op: "settleWorker", childId: worker.childId, workerState: i === 4 ? "error" : "completed" } });
      }
      await page.locator("#chat-input").fill("Check the remaining layout details"); await page.locator("#chat-send").click();
      const card = page.locator("#chat-compact-workers"), pending = page.locator("[data-pending-toggle]");
      const revealWork = async () => {
        // Viewport/text/disclosure changes schedule measured desktop layout.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const reveal = page.locator("#chat-work-toggle");
        if (await reveal.isVisible()) await reveal.click();
      };
      // Baseline captures precede assertions so RED records the actual legacy
      // desktop path and mobile's split heading, not a hand-built mock.
      if (await card.isVisible()) await card.locator(":scope > summary").click();
      await captureScreenshot(page, info, `reference-${engine}-${touch ? "phone" : "desktop"}-initial`);
      await saveEvidence(info, "initial-geometry.json", JSON.stringify(await page.locator("#chat-work-dock").evaluate(dock => [...dock.children].map(node => ({ id: node.id, display: getComputedStyle(node).display, box: node.getBoundingClientRect().toJSON() }))), null, 2));
      await expect(card).toBeVisible();
      await expect(card.locator("[data-worker-id]")).toHaveCount(6);
      await expect(page.locator("#chat-subagents")).toBeHidden();
      await expect(page.locator("#chat-background-tasks")).toBeHidden();
      await expect(pending).toBeVisible();
      expect(await card.evaluate(node => getComputedStyle(node).display)).not.toBe("contents");
      expect(await card.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe("1px");
      expect(await card.evaluate(node => {
        const box = node.getBoundingClientRect(), heading = node.querySelector("summary")!.getBoundingClientRect();
        const rows = node.querySelector("#chat-compact-workers-items")!.getBoundingClientRect();
        return heading.top >= box.top && rows.top >= heading.bottom - 1 && rows.bottom <= box.bottom;
      })).toBe(true);
      expect(await pending.evaluate(node => !!node.closest("#chat-queue") && !node.closest("#chat-compact-workers"))).toBe(true);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const scenes = touch ? [{ width: 390, height: 844, visual: 844 }, { width: 320, height: 568, visual: 568 }, { width: 390, height: 844, visual: 450 }, { width: 390, height: 844, visual: 380 }, { width: 844, height: 390, visual: 230 }] : [{ width: 1280, height: 900, visual: 900 }, { width: 1280, height: 480, visual: 480 }];
        for (const scene of scenes) {
          await page.setViewportSize({ width: scene.width, height: scene.height });
          await page.evaluate(scene => { Object.assign(window.visualViewport!, { height: scene.visual, width: scene.width }); window.visualViewport!.dispatchEvent(new Event("resize")); }, scene);
          await page.locator("#chat-input").fill("Keep the composing draft");
          for (const expanded of [false, true]) {
            await revealWork();
            if ((await card.getAttribute("open") !== null) !== expanded) await card.locator(":scope > summary").click();
            await revealWork();
            // Tiny visual bands prioritize whole actions over pinning chrome;
            // both disclosures must remain reachable in the one dock scroller.
            await pending.scrollIntoViewIfNeeded();
            await expect(pending).toBeInViewport();
            const scrollers = await page.locator("#chat-work-dock").evaluate(node => [node, ...node.querySelectorAll("*")].filter(child => child.getBoundingClientRect().height > 0 && /auto|scroll/.test(getComputedStyle(child).overflowY)).map(child => child.id));
            const sheet = await page.locator("html").getAttribute("data-chat-work-expanded") !== null;
            const tight = await page.locator("#chat-work-dock").getAttribute("data-headings-tight") !== null;
            expect(scrollers).toEqual(sheet || expanded && tight ? ["chat-work-dock"] : expanded ? ["chat-compact-workers-items"] : []);
            expect((await pending.boundingBox())!.y).toBeGreaterThanOrEqual((await card.boundingBox())!.y + (await card.boundingBox())!.height + 7);
            await expect(page.locator("#chat-input")).toHaveValue("Keep the composing draft");
            await captureScreenshot(page, info, `reference-${engine}-${touch ? "phone" : "desktop"}-${theme}-${scene.width}-${scene.visual}-${expanded}`);
          }
        }
      }
      // Saturated real route state: twenty canonical workers and the full
      // twenty-message inbox, with either disclosure and at 200% root text.
      await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      await page.evaluate(touch => { Object.assign(window.visualViewport!, { height: touch ? 844 : 900, width: touch ? 390 : 1280 }); window.visualViewport!.dispatchEvent(new Event("resize")); }, touch);
      for (let i = 0; i < 14; i++) await request.post("/__e2e/chat", { data: { action: "opencode", op: "launchWorker", conversationId } });
      for (let i = 1; i < 20; i++) {
        await page.locator("#chat-input").fill(`Follow-up layout check ${i}`); await page.locator("#chat-send").click();
      }
      await expect(card.locator("[data-worker-id]")).toHaveCount(20);
      await expect(page.locator(".chat-queued-message")).toHaveCount(20);
      for (const enlarged of [false, true]) {
        if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important }" });
        await revealWork();
        if (await card.getAttribute("open") === null) await card.locator(":scope > summary").click();
        await revealWork();
        await pending.scrollIntoViewIfNeeded(); await pending.focus(); await page.keyboard.press("Enter");
        await expect(pending).toHaveAttribute("aria-expanded", "true");
        expect(await page.locator("#chat-work-dock").evaluate(node => [node, ...node.querySelectorAll("*")].filter(child => child.getBoundingClientRect().height > 0 && /auto|scroll/.test(getComputedStyle(child).overflowY)).map(child => child.id))).toEqual(["chat-work-dock"]);
        const remove = page.locator("[data-queue-remove]").last();
        await remove.focus();
        expect(await remove.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
        await captureScreenshot(page, info, `reference-${engine}-${touch ? "phone" : "desktop"}-20-workers-20-pending-${enlarged ? "200" : "100"}`);
        await pending.focus(); await page.keyboard.press("Enter");
        await expect(pending).toHaveAttribute("aria-expanded", "false");
      }
    } finally { await page.close(); }
  });
}
