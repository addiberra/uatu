import { test as base, expect } from "../e2e/fixtures";
import { withEngineBrowsers } from "../e2e/page-diagnostics";
import { recordLinuxWebKitDiagnostics } from "../e2e/linux-webkit-diagnostics";
import type { Browser } from "@playwright/test";

// Keep Playwright-only tests out of Bun's .spec.ts/.test.ts discovery.
// Exercise the actual launchBrowser/diagnostic fixture path, substituting
// Chromium for WebKit only in this regression so macOS can check ownership.
const test = withEngineBrowsers(base).extend<{}, { _webkitBrowser: () => Promise<Browser> }>({
  _webkitBrowser: [async ({ playwright }, use) => {
    const browser = await playwright.chromium.launch();
    await use(async () => browser);
    await browser.close();
  }, { scope: "worker" }],
});

for (const fail of [false, true]) test(`diagnostic contexts retain evidence on ${fail ? "controlled failure" : "success"}`, async ({ page, launchBrowser }, info) => {
  expect(process.env.UATU_LINUX_WEBKIT_DIAGNOSTIC).toBe("1");
  const browser = await launchBrowser("webkit");
  const custom = await browser.newPage();
  const configuredOwner = await recordLinuxWebKitDiagnostics(page.context(), info, "configured");
  const customOwner = await recordLinuxWebKitDiagnostics(custom.context(), info, "webkit-1");
  expect(await recordLinuxWebKitDiagnostics(custom.context(), info, "webkit-1")).toBe(customOwner);
  expect(configuredOwner).not.toBe(customOwner);
  expect(() => recordLinuxWebKitDiagnostics(custom.context(), info, "another-owner")).toThrow("already belongs to another recording");
  for (const target of [page, custom]) {
    await target.goto(`data:text/html,${encodeURIComponent('<div id="chat-surface"><header class="chat-header">Synthetic probe</header><details id="chat-compact-workers"><summary>Workers</summary><p>Ready</p></details><div id="chat-queue-content" style="height:40px;overflow:auto"><div style="height:200px"></div></div></div>')}`);
    await target.locator("summary").click();
    await expect(target.locator("details")).toHaveAttribute("open", "");
    await target.locator("#chat-queue-content").evaluate(node => { node.scrollTop = 20; });
    await target.screenshot({ path: info.outputPath(target === page ? "configured.png" : "custom.png") });
    await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  // The controlled failure intentionally leaves both pages to fixture teardown.
  // Success also covers the target specs' explicit page/browser-close path.
  if (fail) {
    test.fail(true, "controlled diagnostic teardown failure");
    expect("controlled diagnostic teardown failure").toBe("intentional assertion");
  } else {
    await custom.close();
    await browser.close();
  }
});
