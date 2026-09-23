// What the hub remembers about finished work: the two marks the live broker
// composes the per-user `finished` fact from (live-broker.ts, design D2) —
// `finishedAt`, when a workspace's agent work went quiet, and `viewedAt`,
// when each user last had that workspace's chat in view. They outlive the
// pages that read them, and a hub restart — an upgrade, typically, which is
// exactly when a long agent run is likely to be in flight — must not forget
// them either (design D12).
//
// What is deliberately NOT here is the live reading itself (`observed`):
// that is what a child last said, and after a restart the hub has heard
// nothing. Starting empty is what keeps the first frame after startup from
// having a predecessor and being read as a transition (design D3).
//
// Failure behaviour follows personal-state.ts, from which this store takes
// its shape: writes are atomic (temp file, chmod, rename) and coalesced
// behind a short debounce, a missing or unreadable file starts empty rather
// than refusing to serve, and a write that fails degrades the marks to
// memory-only instead of taking a live stream down with it.

import { promises as fs } from "node:fs";

export const ACTIVITY_MARKS_VERSION = 1 as const;

const DEBOUNCE_MS = 250;

// Per workspace: when its work last went quiet. Per user and workspace: when
// that user last viewed it. Stamps are the broker's monotonic counter, so
// only their ORDER means anything; the broker resumes the counter above the
// highest stamp it reads back.
export type ActivityMarks = {
  finishedAt: Map<string, number>;
  viewedAt: Map<string, Map<string, number>>;
};

// What the broker holds: a synchronous read of what was loaded at startup,
// and a write it can call on every change without awaiting anything.
export type ActivityMarkSink = {
  read(): ActivityMarks;
  write(marks: ActivityMarks): void;
};

type PersistedMarks = {
  version: typeof ACTIVITY_MARKS_VERSION;
  finished: Record<string, number>;
  viewed: Record<string, Record<string, number>>;
};

function isStamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneMarks(marks: ActivityMarks): ActivityMarks {
  const viewedAt = new Map<string, Map<string, number>>();
  for (const [user, workspaces] of marks.viewedAt) {
    if (workspaces.size > 0) viewedAt.set(user, new Map(workspaces));
  }
  return { finishedAt: new Map(marks.finishedAt), viewedAt };
}

export function emptyActivityMarks(): ActivityMarks {
  return { finishedAt: new Map(), viewedAt: new Map() };
}

export class ActivityMarkStore implements ActivityMarkSink {
  private marks: ActivityMarks = emptyActivityMarks();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private saveCounter = 0;
  private reportedFailure = false;
  private closed = false;

  constructor(
    private readonly filePath: string,
    private readonly debounceMs: number = DEBOUNCE_MS,
  ) {}

  // Read once at startup, before the broker is constructed. Anything the
  // file cannot yield — it is missing, unreadable, truncated, from another
  // version, or holds entries of the wrong shape — leaves the marks empty
  // (or that entry out) rather than refusing to start the hub: a forgotten
  // badge is a smaller failure than a hub that will not serve.
  async load(): Promise<void> {
    this.marks = emptyActivityMarks();
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf8");
    } catch {
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    if (!isDictionary(raw) || raw.version !== ACTIVITY_MARKS_VERSION) return;
    if (isDictionary(raw.finished)) {
      for (const [workspaceId, stamp] of Object.entries(raw.finished)) {
        if (isStamp(stamp)) this.marks.finishedAt.set(workspaceId, stamp);
      }
    }
    if (isDictionary(raw.viewed)) {
      for (const [user, workspaces] of Object.entries(raw.viewed)) {
        if (!isDictionary(workspaces)) continue;
        const perWorkspace = new Map<string, number>();
        for (const [workspaceId, stamp] of Object.entries(workspaces)) {
          if (isStamp(stamp)) perWorkspace.set(workspaceId, stamp);
        }
        if (perWorkspace.size > 0) this.marks.viewedAt.set(user, perWorkspace);
      }
    }
    await fs.chmod(this.filePath, 0o600).catch(() => undefined);
  }

  read(): ActivityMarks {
    return cloneMarks(this.marks);
  }

  // Called by the broker on every change. The latest picture wins: the
  // debounce coalesces a burst of transitions into one file write, and the
  // write always serializes what is in memory when it runs.
  write(marks: ActivityMarks): void {
    this.marks = cloneMarks(marks);
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persist();
    }, this.debounceMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  // Writes anything still owed now. Shutdown calls it so the last transition
  // before exit is not lost inside the debounce; tests call it to observe
  // the file.
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.persist();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private persist(): Promise<void> {
    // One write at a time: the rename is a commit point, and two in flight
    // could publish them out of order.
    const next = this.chain.then(() => this.save(), () => this.save());
    this.chain = next.catch(() => undefined);
    return next.catch(error => {
      // Memory-only from here: the marks are still right for this hub's
      // lifetime, only a restart would forget them.
      if (this.reportedFailure) return;
      this.reportedFailure = true;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`uatu hub: could not persist activity marks, continuing in memory (${detail})`);
    });
  }

  private async save(): Promise<void> {
    const finished: Record<string, number> = {};
    for (const [workspaceId, stamp] of this.marks.finishedAt) finished[workspaceId] = stamp;
    const viewed: Record<string, Record<string, number>> = {};
    for (const [user, workspaces] of this.marks.viewedAt) {
      if (workspaces.size === 0) continue;
      const perWorkspace: Record<string, number> = {};
      for (const [workspaceId, stamp] of workspaces) perWorkspace[workspaceId] = stamp;
      viewed[user] = perWorkspace;
    }
    const serialized = `${JSON.stringify({
      version: ACTIVITY_MARKS_VERSION,
      finished,
      viewed,
    } satisfies PersistedMarks, null, 2)}\n`;
    const temp = `${this.filePath}.${process.pid}.${(this.saveCounter += 1)}.tmp`;
    try {
      await fs.writeFile(temp, serialized, { mode: 0o600 });
      // Settle the mode before publishing: writeFile's mode is masked by the
      // umask, and the rename is what makes the new file the marks.
      await fs.chmod(temp, 0o600);
      await fs.rename(temp, this.filePath);
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
