import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Temporary Linux investigation, not a required-check configuration. Keep the
// original seven test bodies, identities and per-test budgets, plus eight native
// header cases and four Chromium warning cases. Retain the separate probes for
// explicit investigations; the manual acceptance command runs only e2e.
const files = [
  "**/chat-steering.e2e.ts",
  "**/chat-independent-panel-interaction.e2e.ts",
  "**/chat-reference-workdock.e2e.ts",
  "**/chat-header-reflow.e2e.ts",
  "**/chat-replacement-warning-reflow.e2e.ts",
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
    grep: /steering on touch \(webkit\).*enlarged pending text|header taps expose short-screen actions without focus assistance: webkit|reference work card owns its header and rows: webkit desktop|native conversation header reflows without painted overflow:|steering on touch \(chromium\).*enlarged pending text.*(?:light|dark) 320|enlarged replacement warning remains whole in a short touch viewport:/,
    // Playwright also auto-starts tracing on browser.newContext(), not just
    // its configured page. The opt-in helper owns every diagnostic trace.
    use: { ...base.use, trace: "off" },
  }, {
    // Collection, not resolution: header-subtraction.json records fresh-fixture
    // enlarged-pending baselines, removals and restorations; scroll-causality-*.json[l] records
    // five native disclosure sequences, clamping geometry and write stacks.
    name: "causal-probes",
    testDir: "./tests/diagnostics",
    testMatch: "linux-ui-causality.e2e.ts",
    grep: /Linux causality probe:/,
    metadata: { causalEngine: "webkit" },
    retries: 0,
    timeout: 150_000,
    use: { ...base.use, trace: "off", actionTimeout: 10_000, navigationTimeout: 15_000 },
  }],
});
