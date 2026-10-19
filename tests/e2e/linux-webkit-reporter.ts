import { appendFileSync, mkdirSync } from "node:fs";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";

// Incremental timing survives a global test timeout before the JSON/HTML
// reporters finish. Do not copy request URLs, headers, values or step titles.
export default class LinuxWebKitReporter implements Reporter {
  private write(record: object): void {
    mkdirSync("diagnostic-report", { recursive: true });
    appendFileSync("diagnostic-report/progress.jsonl", `${JSON.stringify({ time: Date.now(), ...record })}\n`);
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.write({ event: "begin", id: test.id, title: test.titlePath(), retry: result.retry, worker: result.workerIndex });
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep): void {
    if (step.duration < 250 && !step.error) return;
    this.write({ event: "step", id: test.id, retry: result.retry, category: step.category, duration: step.duration, failed: !!step.error, line: step.location?.line });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.write({ event: "end", id: test.id, retry: result.retry, status: result.status, duration: result.duration });
  }
}
