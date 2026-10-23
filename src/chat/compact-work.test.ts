import { expect, test } from "bun:test";
import { CompactDisclosure, compactWorkers, workerSummary } from "./compact-work";
import type { ConversationItem } from "./types";

test("canonical aliases display child session metadata once, not task cost or a parent's selection", () => {
  const workerSession = { model: "Latest model", effort: null, costUsd: 0.125 };
  const workers = compactWorkers([
    { type: "tool", id: "tool:a", name: "task", input: '{"description":"Review"}', status: "completed", model: "Old task model", usage: { costUsd: 12 }, workerSession, createdAt: 1 },
    { type: "tool", id: "tool:b", name: "task", input: '{"description":"Review"}', status: "completed", workerSession, createdAt: 2 },
    { type: "background_task", id: "canonical", taskId: "native", toolUseIds: ["a", "b"], description: "Review", status: "running", createdAt: 1 },
  ]);
  expect(workers).toHaveLength(1);
  expect(workers[0]).toMatchObject({ model: "Latest model", effort: null, costUsd: 0.125 });
  expect(compactWorkers([{ type: "background_task", id: "shell", taskId: "shell", taskType: "shell", description: "Tests", status: "running", workerSession, createdAt: 1 }])[0]).not.toHaveProperty("costUsd");
});

test("canonical worker uses real launcher model and cumulative spend without double-counting aliases", () => {
  const workers = compactWorkers([
    { type: "tool", id: "tool:launch", name: "task", status: "completed", input: '{"description":"Task"}', model: "GPT-6.1 Sol", usage: { input: 200, output: 50 }, createdAt: 1 },
    { type: "background_task", id: "worker", taskId: "native", toolUseId: "launch", status: "running", description: "Worker", createdAt: 1 },
  ]);
  expect(workers).toHaveLength(1);
  expect(workers[0]).toMatchObject({ model: "GPT-6.1 Sol", tokens: 250 });
});

test("touch disclosure is deliberate, conversation-scoped, and survives settlement and reselection", () => {
  const state = new CompactDisclosure();
  expect(state.paint("a")).toBe(false);
  state.toggled(true);
  expect(state.paint("a")).toBe(true);
  expect(state.paint(null)).toBe(true);
  expect(state.paint("b")).toBe(false);
  state.toggled(false); // async echo of the selection, not a choice for a
  expect(state.paint("a")).toBe(true);
  state.toggled(false);
  expect(state.paint("b")).toBe(false);
  expect(state.paint("a")).toBe(false);
});

test("desktop opens active batches, holds manual collapse until empty, and leaves settled history as-is", () => {
  const state = new CompactDisclosure();
  expect(state.paint("a", 0, "desktop")).toBe(false); // finished-only history
  expect(state.paint("a", 1, "desktop")).toBe(true);
  state.toggled(true); // delayed programmatic echo
  state.toggled(false);
  expect(state.paint("a", 2, "desktop")).toBe(false);
  expect(state.paint(null, 0, "desktop")).toBe(false);
  expect(state.paint("a", 1, "desktop")).toBe(false);
  expect(state.paint("a", 0, "desktop")).toBe(false);
  expect(state.paint("a", 1, "desktop")).toBe(true);
  expect(state.paint("a", 0, "desktop")).toBe(true);
  state.toggled(false); // closing finished history doesn't veto the next batch
  expect(state.paint("a", 1, "desktop")).toBe(true);
});

test("work seen only on touch does not auto-open finished desktop history", () => {
  const state = new CompactDisclosure();
  expect(state.paint("a", 1, "touch")).toBe(false);
  expect(state.paint("a", 0, "touch")).toBe(false);
  expect(state.paint("a", 0, "desktop")).toBe(false);
  expect(state.paint("a", 1, "touch")).toBe(false);
  expect(state.paint("a", 1, "desktop")).toBe(true);
});

test("native collapse before deferred toggle is observed before live repaint, not overwritten", () => {
  const state = new CompactDisclosure();
  expect(state.paint("a", 1, "desktop", false)).toBe(true);
  // Human closes the DOM; a stream repaint beats the browser's toggle task.
  expect(state.paint("a", 2, "desktop", false)).toBe(false);
  state.toggled(false);
  state.toggled(false);
  expect(state.paint("a", 3, "desktop", false)).toBe(false);
  expect(state.paint("a", 0, "desktop", false)).toBe(false);
  expect(state.paint("a", 1, "desktop", false)).toBe(true);
});

test("desktop and touch choices stay conversation-local and independent through mode flips", () => {
  const state = new CompactDisclosure();
  expect(state.paint("a", 1, "desktop")).toBe(true);
  expect(state.paint("a", 1, "touch")).toBe(false);
  state.toggled(false); // mode-write echo, not a desktop collapse
  expect(state.paint("a", 1, "desktop")).toBe(true);
  state.toggled(false);
  expect(state.paint("b", 1, "desktop")).toBe(true);
  state.toggled(true);
  expect(state.paint("a", 1, "desktop")).toBe(false);
  expect(state.paint("a", 1, "touch")).toBe(false);
  state.toggled(true);
  expect(state.paint("b", 1, "touch")).toBe(false);
  expect(state.paint("a", 0, "touch")).toBe(true);
  expect(state.paint("a", 1, "touch")).toBe(true);
  // Ending/restarting work while touch is selected ends desktop's batch veto,
  // without making the touch expansion a desktop user gesture.
  expect(state.paint("a", 1, "desktop")).toBe(true);
  expect(state.paint("b", 0, "desktop")).toBe(true);
});

test("page-local disclosure cache retains at most 200 conversation choices", () => {
  const state = new CompactDisclosure();
  state.paint("old");
  state.toggled(true);
  for (let index = 0; index < 200; index++) state.paint(`other-${index}`);
  expect(state.paint("old")).toBe(false);
});

test("recently revisited conversation choices survive bounded-cache eviction", () => {
  const state = new CompactDisclosure();
  state.paint("hot"); state.toggled(true);
  for (let index = 0; index < 199; index++) state.paint(`other-${index}`);
  expect(state.paint("hot")).toBe(true);
  state.paint("next");
  expect(state.paint("hot")).toBe(true);
});

test("canonical executions fold launcher aliases but keep repeated occurrences and uncertain outcomes distinct", () => {
  const items = [
    { type: "tool", id: "tool:one", name: "task", status: "completed", input: '{"description":"First reference"}', childConversationId: "child" },
    { type: "tool", id: "tool:two", name: "task", status: "completed", input: '{"description":"Second reference"}', childConversationId: "child" },
    { type: "background_task", id: "first", taskId: "reused", toolUseIds: ["one", "two"], status: "failed", description: "Failed run", childConversationId: "child" },
    { type: "background_task", id: "second", taskId: "reused", status: "running", description: "Later execution", childConversationId: "child" },
    { type: "background_task", id: "third", taskId: "other", status: "stopped", description: "Stopped run" },
    { type: "background_task", id: "unknown", taskId: "uncertain", status: "running", stateUncertain: true, description: "Unknown run" },
    { type: "tool", id: "tool:shell", name: "shell", status: "running", input: "fixture" },
  ] as ConversationItem[];
  const workers = compactWorkers(items);
  expect(workers).toHaveLength(4);
  expect(workers.find(worker => worker.id === "first")?.references).toEqual(["tool:one", "tool:two"]);
  expect(workerSummary(workers)).toBe("1 working · 2 finished · 1 unknown");
  expect(workers.find(worker => worker.id === "first")?.state).toBe("failed");
  expect(workers.find(worker => worker.id === "third")?.state).toBe("stopped");
  expect(workerSummary([])).toBe("No workers");
});

test("pending/generating is not confirmed working and failed tools are finished, not successful", () => {
  const workers = compactWorkers([
    { type: "tool", id: "task", name: "task", status: "pending", input: '{"description":"Pending task"}' },
    { type: "command", id: "shell", command: "fixture", status: "error" },
    { type: "text", id: "text", text: "generating" },
  ] as ConversationItem[]);
  expect(workerSummary(workers)).toBe("1 unknown");
});

test("worker summaries describe only visible work without losing terminal outcomes", () => {
  const workers = compactWorkers([
    { type: "background_task", id: "live", taskId: "live", description: "Live", status: "running", createdAt: 1 },
    { type: "background_task", id: "failed", taskId: "failed", description: "Failed", status: "failed", createdAt: 2 },
    { type: "background_task", id: "stopped", taskId: "stopped", description: "Stopped", status: "stopped", createdAt: 3 },
  ]);
  expect(workerSummary(workers.filter(worker => worker.state === "working"))).toBe("1 working");
  expect(workerSummary(workers.filter(worker => worker.state !== "working"))).toBe("2 finished");
  expect(workerSummary(workers)).toBe("1 working · 2 finished");
  expect(workerSummary([])).toBe("No workers");
});

test("active workers precede newest-first history; only real background shell tasks are workers", () => {
  const workers = compactWorkers([
    { type: "background_task", id: "old", taskId: "old", description: "Old result", status: "completed", createdAt: 1 },
    { type: "background_task", id: "new", taskId: "new", taskType: "local_bash", description: "Background test suite", status: "failed", createdAt: 10 },
    { type: "command", id: "foreground", command: "pwd", status: "running", createdAt: 11 },
    { type: "background_task", id: "foreground-shell", taskId: "fg-shell", taskType: "shell", foreground: true, description: "Blocking command", status: "running", createdAt: 11 },
    { type: "background_task", id: "live", taskId: "live", description: "Live worker", status: "running", createdAt: 12 },
  ] as ConversationItem[]);
  expect(workers.map(worker => worker.id)).toEqual(["live", "new", "old"]);
  expect(workers[1]?.kind).toBe("shell");
  expect(workers[1]?.name).toBe("Background test suite");
});
