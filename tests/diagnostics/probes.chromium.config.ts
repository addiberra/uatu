import { defineConfig } from "@playwright/test";
import diagnostic from "../../playwright.webkit-diagnostic.config";

// Harness validation only: not the Linux verdict and not selected by CI.
export default defineConfig({
  ...diagnostic,
  outputDir: process.env.UATU_TRACE_REGRESSION_OUTPUT ?? ".e2e/causal-probes-chromium",
  reporter: [["line"]],
  projects: diagnostic.projects!.filter(project => project.name === "causal-probes").map(project => ({
    ...project,
    // Resolve relative to this local config, not the repository-root config.
    testDir: ".",
    metadata: { causalEngine: "chromium" },
  })),
});
