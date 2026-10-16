import { boundedSet } from "../shared/bounded-map";
import { backgroundTasksByTool } from "./background-tasks";
import { subagentEntries } from "./timeline-renderer";
import type { ConversationItem } from "./types";

/** Deliberate touch state, independent of the desktop automatic disclosure. */
export class CompactDisclosure {
  private readonly choices = new Map<string, boolean>();
  private conversation: string | null = null;
  private open = false;

  paint(conversation: string | null): boolean {
    if (conversation !== null) {
      this.conversation = conversation;
      this.open = this.choices.get(conversation) ?? false;
    }
    return this.open;
  }

  toggled(open: boolean): void {
    if (open === this.open) return; // includes delayed echoes of our own writes
    this.open = open;
    if (this.conversation) boundedSet(this.choices, this.conversation, open, 200);
  }
}

export type CompactWorker = {
  id: string;
  state: "working" | "finished" | "uncertain";
  references: string[];
};

/** A projection fold, not another worker lifecycle or a task-id tombstone map. */
export function compactWorkers(items: readonly ConversationItem[]): CompactWorker[] {
  const aliases = backgroundTasksByTool(items);
  const workers = new Map<string, CompactWorker>();
  for (const item of items) {
    if (item.type !== "background_task") continue;
    workers.set(item.id, { id: item.id, state: item.stateUncertain ? "uncertain" : item.status === "running" ? "working" : "finished", references: [] });
  }
  const add = (id: string, status: string, canonical?: string) => {
    const worker = canonical ? workers.get(canonical) : undefined;
    if (worker) { worker.references.push(id); return; }
    workers.set(id, { id, state: status === "running" ? "working" : ["completed", "failed", "stopped", "error", "idle"].includes(status) ? "finished" : "uncertain", references: [id] });
  };
  for (const entry of subagentEntries(items)) {
    // Only proven launcher aliases can merge occurrences. A child can run
    // repeatedly, so a shared child id alone is not a deduplication key.
    if (workers.has(entry.id)) continue;
    add(entry.id, entry.status, aliases.get(entry.id)?.id);
  }
  for (const item of items) {
    if (item.type !== "command" && !(item.type === "tool" && /^(shell|bash|local_bash|Bash)$/i.test(item.name))) continue;
    add(item.id, item.status, aliases.get(item.id)?.id);
  }
  return [...workers.values()];
}

export function workerSummary(workers: readonly CompactWorker[]): string {
  if (!workers.length) return "";
  const count = (state: CompactWorker["state"]) => workers.filter(worker => worker.state === state).length;
  const uncertain = count("uncertain");
  return `${count("working")} working · ${count("finished")} finished${uncertain ? ` · ${uncertain} uncertain` : ""}`;
}
