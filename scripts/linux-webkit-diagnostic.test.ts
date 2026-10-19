import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflow = parse(await readFile(new URL("../.github/workflows/agent-coverage.yml", import.meta.url), "utf8"));
const job = workflow.jobs["linux-webkit-diagnostic"];
const guard = "github.event_name == 'workflow_dispatch' && github.repository == 'addiberra/uatu' && github.ref == 'refs/heads/feat/518-opencode-v2-steering-queuing'";

test("diagnostic job is manual-only on exactly the approved fork and ref", () => {
  expect(job.if).toBe(guard);
  // Interpret only the three equality clauses in the actual YAML, not eval.
  const accepts = (event_name: string, repository: string, ref: string) => {
    const github: Record<string, string> = { event_name, repository, ref };
    return job.if.split(" && ").every((clause: string) => {
      const match = /^github\.(event_name|repository|ref) == '([^']+)'$/.exec(clause);
      if (!match) throw new Error("Unexpected guard syntax");
      return github[match[1]!] === match[2];
    });
  };
  const branch = "refs/heads/feat/518-opencode-v2-steering-queuing";
  expect(accepts("workflow_dispatch", "addiberra/uatu", branch)).toBe(true);
  for (const event of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run"]) expect(accepts(event, "addiberra/uatu", branch)).toBe(false);
  expect(accepts("workflow_dispatch", "tjakobsson/uatu", branch)).toBe(false);
  for (const ref of ["refs/heads/main", "refs/heads/other", `${branch}-other`, "refs/tags/feat/518-opencode-v2-steering-queuing"]) expect(accepts("workflow_dispatch", "addiberra/uatu", ref)).toBe(false);
});

test("diagnostic workflow preserves triggers, publishing isolation and least privilege", () => {
  expect(workflow.on).toEqual({ push: { branches: ["main"] }, workflow_dispatch: null });
  expect(workflow.permissions).toEqual({});
  expect(workflow.jobs.publish.if).toBe("github.repository == 'tjakobsson/uatu' && github.ref == 'refs/heads/main'");
  expect(job.permissions).toEqual({ contents: "read" });
  expect(job["runs-on"]).toBe("ubuntu-latest");
  expect(job["timeout-minutes"]).toBe(25);
  expect(job.strategy).toBeUndefined();
  const checkout = job.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/checkout@"));
  expect(checkout.with["persist-credentials"]).toBe(false);
  for (const step of job.steps) {
    if (step.uses) expect(step.uses).toMatch(/^[\w/-]+@[a-f0-9]{40}$/);
    if (step.run) expect(step.run).not.toContain("${{");
    expect(JSON.stringify(step)).not.toContain("secrets.");
  }
  const upload = job.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"));
  expect(upload.if).toBe("always()");
  expect(upload.with["retention-days"]).toBe(3);
  const run = job.steps.find((step: { name: string }) => step.name === "Run only selected Linux WebKit cases");
  expect(run["timeout-minutes"]).toBe(12);
  expect(run.env).toEqual({ UATU_LINUX_WEBKIT_DIAGNOSTIC: "1" });
});

type Suite = { specs?: { id: string; title: string; tests: { projectName: string }[] }[]; suites?: Suite[] };
function list(config: string) {
  const env = { ...process.env, CI: "true" };
  delete env.JEST_WORKER_ID;
  delete env.UATU_E2E_LEG;
  const result = Bun.spawnSync([process.execPath, "run", "test:e2e", `--config=${config}`, "--list", "--reporter=json"], { cwd: root, env });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const report = JSON.parse(result.stdout.toString());
  expect(report.errors).toEqual([]);
  const ids = new Map<string, string>();
  function walk(suite: Suite) {
    for (const spec of suite.specs ?? []) for (const entry of spec.tests) ids.set(`${entry.projectName}:${spec.id}`, spec.title);
    for (const child of suite.suites ?? []) walk(child);
  }
  walk(report);
  return ids;
}

test("diagnostic config selects seven existing WebKit test identities only", () => {
  const full = list("playwright.config.ts");
  const selected = list("playwright.webkit-diagnostic.config.ts");
  expect(selected.size).toBe(7);
  for (const [id, title] of selected) {
    expect(full.get(id)).toBe(title);
    expect(id.startsWith("e2e:")).toBe(true);
  }
  const titles = [...selected.values()];
  expect(titles.filter(title => title.startsWith("enlarged pending text"))).toHaveLength(4);
  expect(titles.filter(title => title.startsWith("header taps") && title.includes("webkit"))).toHaveLength(2);
  expect(titles.filter(title => title === "reference work card owns its header and rows: webkit desktop")).toHaveLength(1);
}, 30_000);
