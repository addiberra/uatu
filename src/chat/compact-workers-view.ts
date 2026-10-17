import type { CompactWorker } from "./compact-work";
import { workerIsActive, workerStateLabel } from "./worker-state";
import { formatTaskElapsed } from "./task-inspection";

const glyphs = { working: "●", unknown: "◌", completed: "✓", failed: "×", stopped: "■" };

/** One keyed row per projected occurrence. Streaming paints retain tap targets. */
export class CompactWorkersView {
  private readonly active = document.createElement("ul");
  private readonly history = document.createElement("details");
  private readonly label = document.createElement("summary");
  private readonly finished = document.createElement("ul");
  private readonly rows = new Map<string, HTMLLIElement>();
  private conversation: string | null = null;

  constructor(private readonly host: HTMLElement) {
    this.active.setAttribute("aria-label", "Active workers");
    this.finished.setAttribute("aria-label", "Finished workers, newest first");
    this.history.className = "chat-workers-history";
    this.history.append(this.label, this.finished);
    host.replaceChildren(this.active, this.history);
  }

  paint(conversation: string | null, workers: readonly CompactWorker[], stopping: ReadonlySet<string>, canStop: boolean): void {
    const focused = document.activeElement;
    const focusedRow = focused instanceof Element && this.host.contains(focused) ? focused.closest<HTMLElement>("[data-worker-id]") : null;
    if (conversation !== this.conversation) {
      this.history.open = false;
      this.conversation = conversation;
    }
    const ids = new Set(workers.map(worker => worker.id));
    for (const [id, row] of this.rows) if (!ids.has(id)) { row.remove(); this.rows.delete(id); }
    for (const worker of workers) {
      let row = this.rows.get(worker.id);
      if (!row) {
        row = document.createElement("li");
        row.dataset.workerId = worker.id;
        row.className = "chat-worker-row";
        const inspect = document.createElement("button");
        inspect.type = "button";
        inspect.className = "chat-worker-inspect";
        for (const part of ["glyph", "name", "meta"]) {
          const span = document.createElement("span");
          span.className = `chat-worker-${part}`;
          if (part === "glyph") span.setAttribute("aria-hidden", "true");
          inspect.append(span);
        }
        row.append(inspect);
        this.rows.set(worker.id, row);
      }
      row.dataset.state = worker.state;
      if (worker.taskId) row.dataset.backgroundTask = worker.taskId;
      const inspect = row.firstElementChild as HTMLButtonElement;
      inspect.dataset.workerItem = worker.id;
      if (worker.taskId) inspect.dataset.inspectTask = worker.taskId;
      inspect.title = worker.name;
      // The handler looks up the current row model, not a stale closure.
      inspect.querySelector(".chat-worker-glyph")!.textContent = glyphs[worker.state];
      inspect.querySelector(".chat-worker-name")!.textContent = worker.name;
      const meta = inspect.querySelector<HTMLElement>(".chat-worker-meta")!;
      meta.textContent = [worker.kind === "shell" ? "Shell worker" : "Agent", workerStateLabel(worker.state)].join(" · ");
      if (worker.since) {
        const time = document.createElement("span");
        if (workerIsActive(worker.state)) {
          time.dataset.elapsedSince = String(worker.since);
          time.textContent = formatTaskElapsed(Date.now() - worker.since);
        } else {
          const clock = new Date(worker.settledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          time.textContent = worker.settledAt === worker.since ? `Started ${clock}` : clock;
        }
        meta.append(" · ", time);
      }
      if (worker.progress) meta.append(` · ${worker.progress}`);
      inspect.dataset.kind = worker.kind;
      let stop = row.querySelector<HTMLButtonElement>("[data-stop-task]");
      if (worker.taskId && worker.stoppable && workerIsActive(worker.state) && canStop) {
        if (!stop) {
          stop = document.createElement("button");
          stop.type = "button";
          stop.className = "chat-task-stop";
          row.append(stop);
        }
        stop.dataset.stopTask = worker.taskId;
        stop.dataset.stopItem = worker.id;
        stop.textContent = stopping.has(worker.taskId) ? "Stopping…" : "Stop worker";
        stop.disabled = worker.state === "unknown" || stopping.has(worker.taskId);
        stop.setAttribute("aria-label", `Stop worker: ${worker.name}`);
        stop.title = worker.state === "unknown" ? "Status unknown — refresh before stopping" : `Stop worker: ${worker.name}`;
      } else stop?.remove();
      const list = workerIsActive(worker.state) ? this.active : this.finished;
      // Append only where order actually changed; do not detach a focused row.
      const index = workers.filter(candidate => workerIsActive(candidate.state) === workerIsActive(worker.state)).findIndex(candidate => candidate.id === worker.id);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    const settled = workers.filter(worker => !workerIsActive(worker.state));
    const outcomes = ["completed", "failed", "stopped"].map(state => {
      const count = settled.filter(worker => worker.state === state).length;
      return count ? `${count} ${workerStateLabel(state)}` : "";
    }).filter(Boolean);
    this.label.textContent = `Finished ${settled.length} · ${outcomes.join(" · ")} · newest first`;
    this.history.hidden = settled.length === 0;
    if (focusedRow && (!(focused as Element).isConnected || (focused as Element).matches(":disabled") || !this.history.open && this.finished.contains(focusedRow))) {
      const surviving = this.rows.get(focusedRow.dataset.workerId!);
      const target = surviving && this.active.contains(surviving) ? surviving.querySelector<HTMLElement>(".chat-worker-inspect") : this.host.parentElement?.querySelector<HTMLElement>(":scope > summary");
      target?.focus({ preventScroll: true });
    }
  }
}
