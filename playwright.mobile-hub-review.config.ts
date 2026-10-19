import { defineConfig, devices } from "@playwright/test";
const port = process.env.UATU_MOBILE_REVIEW_PORT ?? "4703";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid review test port");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/mobile-hub-review", testMatch: "**/*.e2e.ts", workers: 1,
  // Standalone Bun diagnostic runners do not register Playwright tests.
  testIgnore: ["**/visual.e2e.ts", "**/responsive.e2e.ts"],
  // Opt-in screenshot batches only; keep all functional cases in these files.
  grepInvert: process.env.CI ? [/reference flow visual batch:/, /existing-folder visual batch:/] : undefined,
  forbidOnly: !!process.env.CI,
  outputDir: "./tests/mobile-hub-review/results/test-results",
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "./tests/mobile-hub-review/results/html", open: "never" }]] : "list",
  use: { ...devices["iPhone 13"], baseURL: origin, serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "bun tests/mobile-hub-review/server.ts", url: `${origin}/review/health`, reuseExistingServer: false, timeout: 30_000 },
});
