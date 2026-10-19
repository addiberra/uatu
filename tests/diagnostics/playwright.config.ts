import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import diagnostic from "../../playwright.webkit-diagnostic.config";

const output = path.resolve(process.env.UATU_TRACE_REGRESSION_OUTPUT ?? ".e2e/trace-lifecycle");

// Inherit the real diagnostic trace settings. Only replace selection/output
// and retries for this local lifecycle regression, never the seven CI cases.
export default defineConfig({
  ...diagnostic,
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  retries: 0,
  outputDir: path.join(output, "results"),
  reporter: [["line"], ["json", { outputFile: path.join(output, "report.json") }]],
  projects: diagnostic.projects!.filter(project => project.name === "e2e").map(project => ({ ...project, testMatch: "trace-lifecycle.e2e.ts", grep: /.*/ })),
});
