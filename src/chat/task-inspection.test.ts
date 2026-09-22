import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

import { TASK_OUTPUT_REFRESH_MS, TaskInspectionPanel, formatTaskElapsed, runningTaskForChild, taskInspection, taskSettledLabel, taskUsageLabel, type TaskInspectionTimers } from "./task-inspection";
import type { BackgroundTaskItem, BackgroundTaskOutput } from "./types";

describe("task inspection facts", () => {
  test("the elapsed clock reads m:ss, then h:mm:ss", () => {
    expect(formatTaskElapsed(0)).toBe("0:00");
    expect(formatTaskElapsed(7_400)).toBe("0:07");
    expect(formatTaskElapsed(65_000)).toBe("1:05");
    expect(formatTaskElapsed(3_723_000)).toBe("1:02:03");
    expect(formatTaskElapsed(-5_000)).toBe("0:00");
  });

  test("usage and the settled line read as the agent reported them", () => {
    expect(taskUsageLabel({ totalTokens: 13_122, toolUses: 1, durationMs: 4_751 })).toBe("13k tokens · 1 tool use");
    expect(taskUsageLabel({ totalTokens: 640, toolUses: 3, durationMs: 100 })).toBe("640 tokens · 3 tool uses");
    expect(taskSettledLabel(item({ status: "completed", summary: "There is 1 file" }))).toBe("finished · There is 1 file");
    expect(taskSettledLabel(item({ status: "failed" }))).toBe("failed");
    expect(taskSettledLabel(item({ status: "stopped", summary: "  " }))).toBe("stopped");
  });

  test("a child transcript is matched to the running task that owns it", () => {
    const agent = item({ taskId: "a", childConversationId: "sub:p:a" });
    const settled = item({ taskId: "b", childConversationId: "sub:p:b", status: "completed" });
    expect(runningTaskForChild([agent, settled], "sub:p:a")).toBe(agent);
    expect(runningTaskForChild([agent, settled], "sub:p:b")).toBeUndefined();
    expect(taskInspection(agent)).toEqual({ view: "transcript", conversationId: "sub:p:a" });
    expect(taskInspection(item({ taskType: "local_bash" }))).toEqual({ view: "output" });
  });
});

describe("task inspection panel", () => {
  let dom: ReturnType<typeof parseHTML>;
  let restore: Array<() => void> = [];
  let now = 100_000;
  let scheduled: Array<{ kind: "interval" | "timeout"; fn: () => void; ms: number; cleared: boolean }> = [];
  const timers: TaskInspectionTimers = {
    setInterval: (fn, ms) => { const entry = { kind: "interval" as const, fn, ms, cleared: false }; scheduled.push(entry); return entry; },
    clearInterval: handle => { (handle as { cleared: boolean }).cleared = true; },
    // A timeout that fires is spent, as a real one is.
    setTimeout: (fn, ms) => { const entry = { kind: "timeout" as const, ms, cleared: false, fn: () => { entry.cleared = true; fn(); } }; scheduled.push(entry); return entry; },
    clearTimeout: handle => { (handle as { cleared: boolean }).cleared = true; },
  };
  const live = () => scheduled.filter(entry => !entry.cleared);
  let reads: Array<{ conversationId: string; taskId: string; signal: AbortSignal; resolve: (output: BackgroundTaskOutput | null) => void; reject: (error: unknown) => void }> = [];
  let errors: unknown[] = [];

  beforeEach(() => {
    dom = parseHTML('<!doctype html><html><body><div id="strip" hidden></div><div id="output" hidden><p id="note" hidden></p><pre id="text"></pre></div></body></html>');
    for (const [key, value] of Object.entries({ document: dom.document, window: dom.window })) {
      const old = Reflect.get(globalThis, key); Reflect.set(globalThis, key, value); restore.push(() => Reflect.set(globalThis, key, old));
    }
    now = 100_000;
    scheduled = [];
    reads = [];
    errors = [];
  });
  afterEach(() => { restore.forEach(fn => fn()); restore = []; });

  const hosts = () => ({
    strip: dom.document.querySelector("#strip") as unknown as HTMLElement,
    output: dom.document.querySelector("#output") as unknown as HTMLElement,
    outputText: dom.document.querySelector("#text") as unknown as HTMLElement,
    outputNote: dom.document.querySelector("#note") as unknown as HTMLElement,
  });
  const panel = () => new TaskInspectionPanel({
    hosts: hosts(),
    fetchOutput: (conversationId, taskId, signal) => new Promise((resolve, reject) => { reads.push({ conversationId, taskId, signal, resolve, reject }); }),
    onError: error => { errors.push(error); },
    now: () => now,
    timers,
  });
  const text = (selector: string) => dom.document.querySelector(selector)?.textContent ?? null;

  test("an agent task's strip names the task, its type, progress, elapsed, spend, and Stop; it ticks and settles into one line", () => {
    const view = panel();
    const task = item({ taskId: "ada2b", description: "Review renderer", taskType: "local_agent", subagentType: "explore", createdAt: now - 65_000, childConversationId: "sub:p:ada2b", progress: "Reading the tests", usage: { totalTokens: 13_122, toolUses: 1, durationMs: 4_000 } });
    view.show({ conversationId: "one", taskId: "ada2b", view: "transcript" }, task);

    const strip = hosts().strip;
    expect(strip.hidden).toBe(false);
    expect(strip.dataset.taskId).toBe("ada2b");
    expect(strip.dataset.taskState).toBe("running");
    expect(text("#strip .chat-drilldown-task-description")).toBe("Review renderer");
    expect(text("#strip .chat-drilldown-task-type")).toBe("explore");
    expect(text("#strip .chat-drilldown-task-progress")).toBe("Reading the tests");
    expect(text("#strip [data-task-elapsed]")).toBe("1:05");
    expect(text("#strip .chat-drilldown-task-usage")).toBe("13k tokens · 1 tool use");
    const stop = dom.document.querySelector<HTMLButtonElement>('#strip [data-stop-task="ada2b"]')!;
    expect(stop.textContent).toBe("Stop");
    expect(stop.disabled).toBe(false);
    // The transcript view has no output pane.
    expect(hosts().output.hidden).toBe(true);
    expect(reads).toHaveLength(0);

    // The clock ticks once a second without rebuilding the strip.
    const clock = live().filter(entry => entry.kind === "interval");
    expect(clock.map(entry => entry.ms)).toEqual([1_000]);
    const description = dom.document.querySelector("#strip .chat-drilldown-task-description");
    now += 2_000;
    clock[0]!.fn();
    expect(text("#strip [data-task-elapsed]")).toBe("1:07");
    expect(dom.document.querySelector("#strip .chat-drilldown-task-description")).toBe(description);

    // A stop in flight disables the control; a progress update repaints in place.
    view.sync({ ...task, progress: "Using Bash" }, true);
    expect(text("#strip .chat-drilldown-task-progress")).toBe("Using Bash");
    expect(dom.document.querySelector<HTMLButtonElement>("#strip [data-stop-task]")!.disabled).toBe(true);
    expect(dom.document.querySelector("#strip [data-stop-task]")!.textContent).toBe("Stopping…");

    // Settling turns the strip into one line and stops the clock.
    view.sync({ ...task, status: "completed", summary: "Two findings" });
    expect(strip.dataset.taskState).toBe("settled");
    expect(strip.classList.contains("is-settled")).toBe(true);
    expect(text("#strip .chat-drilldown-task-settled")).toBe("finished · Two findings");
    expect(dom.document.querySelector("#strip [data-stop-task]")).toBeNull();
    expect(dom.document.querySelector("#strip [data-task-elapsed]")).toBeNull();
    expect(live()).toHaveLength(0);

    view.close();
    expect(strip.hidden).toBe(true);
    expect(strip.childNodes.length).toBe(0);
  });

  test("a shell task's view reads the output on open, every two seconds while running, once more on settle, and never after close", async () => {
    const view = panel();
    const task = item({ taskId: "bgjpa", description: "sleep 25; echo done", taskType: "local_bash", createdAt: now - 3_000, outputFile: "/tmp/tasks/bgjpa.output" });
    view.show({ conversationId: "one", taskId: "bgjpa", view: "output" }, task);

    expect(hosts().output.hidden).toBe(false);
    expect(hosts().outputNote.hidden).toBe(false);
    expect(text("#note")).toBe("Output not yet available");
    expect(text("#strip [data-task-elapsed]")).toBe("0:03");
    // No progress note is asserted for a shell task; elapsed is its live signal.
    expect(dom.document.querySelector("#strip .chat-drilldown-task-progress")).toBeNull();
    expect(reads.map(read => [read.conversationId, read.taskId])).toEqual([["one", "bgjpa"]]);

    // Nothing is scheduled until the read answers: reads never stack.
    expect(live().filter(entry => entry.kind === "timeout")).toHaveLength(0);
    reads[0]!.resolve(null);
    await settle();
    expect(text("#note")).toBe("Output not yet available");
    const poll = live().filter(entry => entry.kind === "timeout");
    expect(poll.map(entry => entry.ms)).toEqual([TASK_OUTPUT_REFRESH_MS]);

    poll[0]!.fn();
    expect(reads).toHaveLength(2);
    reads[1]!.resolve({ text: "first\nsecond\n", truncated: false, settled: false });
    await settle();
    expect(text("#text")).toBe("first\nsecond\n");
    expect(hosts().outputNote.hidden).toBe(true);

    live().filter(entry => entry.kind === "timeout")[0]!.fn();
    reads[2]!.resolve({ text: "second\nthird\n", truncated: true, settled: false });
    await settle();
    expect(text("#text")).toBe("second\nthird\n");
    expect(hosts().outputNote.hidden).toBe(false);
    expect(text("#note")).toContain("trimmed");

    // Settling stops the poll and reads once more for the final lines.
    const pending = live().filter(entry => entry.kind === "timeout");
    expect(pending).toHaveLength(1);
    view.sync({ ...task, status: "completed", summary: "exit 0" });
    expect(pending[0]!.cleared).toBe(true);
    expect(reads).toHaveLength(4);
    reads[3]!.resolve({ text: "third\n[exited with code 0]\n", truncated: false, settled: true });
    await settle();
    expect(text("#text")).toBe("third\n[exited with code 0]\n");
    expect(text("#strip .chat-drilldown-task-settled")).toBe("finished · exit 0");
    // A settled read schedules nothing further.
    expect(live()).toHaveLength(0);

    view.close();
    expect(hosts().output.hidden).toBe(true);
    expect(text("#text")).toBe("");
  });

  test("closing mid-read discards the answer and stops the poll; a failed read is reported and retried on the next tick", async () => {
    const view = panel();
    const task = item({ taskId: "bgjpa", taskType: "local_bash", createdAt: now });
    view.show({ conversationId: "one", taskId: "bgjpa", view: "output" }, task);
    reads[0]!.reject(new Error("workspace did not answer"));
    await settle();
    expect(errors.map(error => (error as Error).message)).toEqual(["workspace did not answer"]);
    const poll = live().filter(entry => entry.kind === "timeout");
    expect(poll).toHaveLength(1);
    poll[0]!.fn();
    expect(reads).toHaveLength(2);

    view.close();
    expect(reads[1]!.signal.aborted).toBe(true);
    expect(live()).toHaveLength(0);
    reads[1]!.resolve({ text: "late", truncated: false, settled: false });
    await settle();
    expect(text("#text")).toBe("");
    expect(hosts().output.hidden).toBe(true);
  });

  test("a hidden surface skips the read and tries again on the next tick", async () => {
    let active = false;
    const view = new TaskInspectionPanel({
      hosts: hosts(),
      fetchOutput: (conversationId, taskId, signal) => new Promise((resolve, reject) => { reads.push({ conversationId, taskId, signal, resolve, reject }); }),
      active: () => active,
      now: () => now,
      timers,
    });
    view.show({ conversationId: "one", taskId: "bgjpa", view: "output" }, item({ taskId: "bgjpa", taskType: "local_bash" }));
    expect(reads).toHaveLength(0);
    const poll = live().filter(entry => entry.kind === "timeout");
    expect(poll).toHaveLength(1);
    active = true;
    poll[0]!.fn();
    expect(reads).toHaveLength(1);
    view.close();
  });

  test("a task gone from the projection leaves an empty strip rather than a stale one", () => {
    const view = panel();
    view.show({ conversationId: "one", taskId: "x", view: "transcript" }, item({ taskId: "x" }));
    expect(hosts().strip.hidden).toBe(false);
    view.sync(undefined);
    expect(hosts().strip.hidden).toBe(true);
    expect(live()).toHaveLength(0);
    view.close();
  });
});

function item(extra: Partial<BackgroundTaskItem> = {}): BackgroundTaskItem {
  return { id: `task:${extra.taskId ?? "t"}`, type: "background_task", createdAt: 1, taskId: "t", description: "Task", status: "running", ...extra };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
}
