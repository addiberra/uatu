import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base, testMatch: ["mobile-live-accounts.e2e.ts"], workers: 1, fullyParallel: false,
  projects: [
    { name: "mobile-live-chromium", use: { browserName: "chromium", hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } },
    { name: "mobile-live-webkit", use: { browserName: "webkit", hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } },
  ],
});
