import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Temporary Linux investigation, not a required-check configuration. Keep the
// original test bodies, identities and per-test budgets; only select cases.
const files = [
  "**/chat-steering.e2e.ts",
  "**/chat-independent-panel-interaction.e2e.ts",
  "**/chat-reference-workdock.e2e.ts",
];

export default defineConfig({
  ...base,
  workers: 1,
  retries: 1,
  // Leave teardown/report/upload time within the diagnostic job's 25m bound.
  globalTimeout: 10 * 60_000,
  outputDir: "diagnostic-results",
  reporter: [
    ["line"],
    ["./tests/e2e/linux-webkit-reporter.ts"],
    ["json", { outputFile: "diagnostic-report/results.json" }],
    ["html", { outputFolder: "diagnostic-report/html", open: "never" }],
  ],
  projects: [{
    ...base.projects!.find(project => project.name === "e2e")!,
    testMatch: files,
    testIgnore: [],
    grep: /steering on touch \(webkit\).*enlarged pending text|header taps expose short-screen actions without focus assistance: webkit|reference work card owns its header and rows: webkit desktop/,
    use: { ...base.use, trace: "on" },
  }],
});
