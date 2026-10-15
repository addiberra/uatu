import { defineConfig, devices } from "@playwright/test";
const port = process.env.UATU_MOBILE_REVIEW_PORT ?? "4703";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid review test port");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/mobile-hub-review", testMatch: "**/*.e2e.ts", workers: 1,
  outputDir: "./tests/mobile-hub-review/results", reporter: "list",
  use: { ...devices["iPhone 13"], baseURL: origin, serviceWorkers: "block" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: "bun tests/mobile-hub-review/server.ts", url: `${origin}/review/health`, reuseExistingServer: false, timeout: 30_000 },
});
