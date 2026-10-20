import { test as base, expect } from "./fixtures";
import { withEngineBrowsers, attachPageDiagnosticsOnFailure } from "./page-diagnostics";
import { enlargedPendingFixture } from "./enlarged-pending-fixture";
import { saveEvidence } from "./evidence";

const test = withEngineBrowsers(base);
attachPageDiagnosticsOnFailure(test);

for (const engine of ["chromium", "webkit"] as const) {
  for (const width of [320, 390]) for (const theme of ["light", "dark"] as const) {
    test(`native conversation header reflows without painted overflow: ${engine} ${theme} ${width}`, async ({ launchBrowser, baseURL, request }, info) => {
      const browser = await launchBrowser(engine);
      const page = await browser.newPage({ baseURL, viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      try {
        await enlargedPendingFixture(page, request, width, theme);
        const picker = page.getByRole("combobox", { name: "Conversation", exact: true });
        const selected = await picker.inputValue();
        const titles = [null,
          "A long conversation title that must stay inside its native picker while every header action remains available",
          "An_unbroken_conversation_title_that_must_not_expand_the_native_selected_value_beyond_the_available_header_width",
        ];
        for (const title of titles) {
          if (title) {
            await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
            await page.getByRole("button", { name: "Rename conversation", exact: true }).click();
            await page.locator("#chat-rename-title").fill(title);
            await page.locator("#chat-rename-title").press("Enter");
            await expect(page.locator("#chat-rename-form")).toBeHidden();
            await expect(picker.locator("option:checked")).toContainText(title);
          }
          for (const percent of [200, 100, 200]) {
            await page.evaluate(percent => { document.documentElement.style.fontSize = `${percent}%`; }, percent);
            await page.evaluate(() => document.fonts.ready);
            // Linux WebKit can report a fitting layout before its native control
            // paints. Force that paint before measuring, without retaining images.
            await page.screenshot({ animations: "disabled" });
            const geometry = await page.evaluate(() => {
              const ids = ["chat-surface", "chat-work-dock", "chat-conversation-select", "chat-rename-conversation", "chat-new-conversation"];
              return ids.map(id => {
                const node = document.getElementById(id)!;
                const box = node.getBoundingClientRect();
                return { id, width: node.clientWidth, scroll: node.scrollWidth, box: box.toJSON(),
                  font: getComputedStyle(node).fontSize,
                  hit: node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
              });
            });
            await saveEvidence(info, `header-${percent}-${info.attachments.length}.json`, JSON.stringify(geometry, null, 2));
            for (const node of geometry) {
              expect(node.box.left).toBeGreaterThanOrEqual(0);
              expect(node.box.right).toBeLessThanOrEqual(width);
              if (node.id === "chat-surface" || node.id === "chat-work-dock") expect(node.scroll).toBeLessThanOrEqual(node.width);
              else {
                expect(node.hit).toBe(true);
                expect(node.box.height).toBeGreaterThanOrEqual(44);
              }
            }
            const select = geometry.find(node => node.id === "chat-conversation-select")!;
            expect(select.font).toBe(`${16 * percent / 100}px`);
            // At 200% the readable 12rem basis exceeds the available row. The
            // native picker must own that row, not collapse between the actions.
            if (percent === 200) {
              const actions = geometry.filter(node => /chat-(rename|new)-conversation/.test(node.id));
              for (const action of actions) expect(action.box.top).toBeGreaterThanOrEqual(select.box.bottom);
            }
          }
        }
        await expect(picker).toHaveValue(selected);
        expect(await picker.evaluate(node => node instanceof HTMLSelectElement && node.labels!.length > 0 && node.options.length > 0)).toBe(true);
        // Keep real keyboard focus and the native picker; reflow must not
        // replace them with clipped replicas or inaccessible custom controls.
        await picker.focus();
        await expect(picker).toBeFocused();
        await picker.press("Tab");
        await expect(page.getByRole("button", { name: "Rename conversation", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "New conversation", exact: true })).toBeFocused();
        if (engine === "chromium" && width === 390) {
          // A separate desktop context exercises the normal-sized native popup,
          // not merely the touch control's measured box at enlarged text.
          const desktop = await browser.newPage({ baseURL, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
          try {
            await enlargedPendingFixture(desktop, request, 1280, theme);
            await desktop.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
            const desktopPicker = desktop.getByRole("combobox", { name: "Conversation", exact: true });
            const previous = await desktopPicker.inputValue();
            await desktop.getByRole("button", { name: "New conversation", exact: true }).click();
            await expect(desktopPicker).not.toHaveValue(previous);
            const values = await desktopPicker.locator("option").evaluateAll(options => options.map(option => option.value).filter(Boolean));
            expect(values.length).toBeGreaterThanOrEqual(2);
            const target = values.at(-1)!;
            await desktopPicker.selectOption(target);
            const title = "ZZZ Desktop native picker retains the complete long conversation title during keyboard selection";
            await desktop.getByRole("button", { name: "Rename conversation", exact: true }).click();
            await desktop.locator("#chat-rename-title").fill(title);
            await desktop.locator("#chat-rename-title").press("Enter");
            await expect(desktop.locator("#chat-rename-form")).toBeHidden();
            await desktopPicker.selectOption(values[0]!);
            await desktopPicker.focus();
            await desktopPicker.press("Space");
            await desktopPicker.press("z");
            await desktopPicker.press("Enter");
            await expect(desktopPicker).toHaveValue(target);
            await expect(desktopPicker.locator("option:checked")).toContainText(title);
            await expect(desktopPicker).toBeFocused();
            expect(await desktopPicker.evaluate(node => {
              const control = node.getBoundingClientRect();
              const header = node.closest(".chat-header")!;
              const bounds = header.getBoundingClientRect();
              return node instanceof HTMLSelectElement && control.width > 0 && control.left >= bounds.left
                && control.right <= bounds.right && header.scrollWidth <= header.clientWidth;
            })).toBe(true);
          } finally { await desktop.close(); }
        }
      } finally { await page.close(); }
    });
  }
}
