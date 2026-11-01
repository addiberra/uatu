import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Keep the default suite intact. Run this workspace matrix separately from
// other fixture-backed commands: workers share the .e2e workspace namespace.
// Local/CI command: bun run test:e2e --config=playwright.mobile.config.ts
// CI also runs this config as its separate "touch navigation" matrix leg.
export default defineConfig({
  ...base,
  testMatch: ["navigation-overlay.e2e.ts", "preview-file-navigation.e2e.ts"],
  workers: 1,
  use: { ...base.use, trace: "off", video: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "mobile-chromium", use: { browserName: "chromium" } },
    { name: "mobile-webkit", use: { browserName: "webkit" } },
  ],
});
