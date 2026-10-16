import { expect, test } from "bun:test";
import { CompactDisclosure, compactWorkers, workerSummary } from "./compact-work";
import type { ConversationItem } from "./types";

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
  expect(workers).toHaveLength(5);
  expect(workers.find(worker => worker.id === "first")?.references).toEqual(["tool:one", "tool:two"]);
  expect(workerSummary(workers)).toBe("2 working · 2 finished · 1 uncertain");
  expect(workerSummary([])).toBe("");
});

test("pending/generating is not confirmed working and failed tools are finished, not successful", () => {
  const workers = compactWorkers([
    { type: "tool", id: "task", name: "task", status: "pending", input: '{"description":"Pending task"}' },
    { type: "command", id: "shell", command: "fixture", status: "error" },
    { type: "text", id: "text", text: "generating" },
  ] as ConversationItem[]);
  expect(workerSummary(workers)).toBe("0 working · 1 finished · 1 uncertain");
});
