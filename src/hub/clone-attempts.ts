import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type CloneAttemptResult = { status: "accepted"; jobId: string } | { status: "pending" | "not-accepted" | "expired" };
type RecordValue = { version: 1; owner: string; digest: string | null; status: "pending" | "not-accepted" | "accepted"; jobId?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`;
  return JSON.stringify(value);
}
function failure(status: number, error: string) { return Response.json({ error }, { status, headers: { "cache-control": "no-store" } }); }

/** Durable admission only, not a second clone runner. Tombstones are never
 * silently evicted: expiry of a job/restart cannot make its attempt reusable.
 * Only hashes of request/owner are persisted, never URL/password/key material.
 * The Hub's existing single-process state lease remains the writer boundary. */
export class CloneAttemptStore {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly active = new Map<string, Promise<Response>>();
  constructor(private readonly directory: string, private readonly hasJob: (owner: string, id: string) => boolean, private readonly capacity = 10_000) {}
  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.chain.then(run, run); this.chain = result.catch(() => {}); return result;
  }
  private file(id: string) { return path.join(this.directory, `${hash(id)}.json`); }
  private async read(id: string): Promise<RecordValue | null> {
    let contents: string;
    try { contents = await fs.readFile(this.file(id), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const row = JSON.parse(contents) as RecordValue;
    if (row.version !== 1 || !/^[a-f0-9]{64}$/.test(row.owner) || (row.digest !== null && !/^[a-f0-9]{64}$/.test(row.digest)) || !["pending", "not-accepted", "accepted"].includes(row.status)
      || (row.status === "accepted" && (typeof row.jobId !== "string" || !row.jobId))) throw new Error("Invalid clone attempt record");
    return row;
  }
  private async write(id: string, row: RecordValue, create = false) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (create && (await fs.readdir(this.directory)).filter(name => name.endsWith(".json")).length >= this.capacity) throw new Error("Clone attempt capacity reached");
    const file = this.file(id), temp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(row)); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temp, file);
      const dir = await fs.open(this.directory, "r");
      try { await dir.sync(); } finally { await dir.close(); }
    } finally { await fs.rm(temp, { force: true }); }
  }
  async reconcile(owner: string, id: string): Promise<Response> {
    if (!validId(id)) return failure(400, "invalid clone attempt id");
    try {
      return await this.exclusive(async () => {
        let row = await this.read(id);
        if (row && row.owner !== hash(owner)) return failure(404, "clone attempt not found");
        if (!row) {
          row = { version: 1, owner: hash(owner), digest: null, status: "not-accepted" };
          // Lookup fences absence BEFORE reporting it, including delayed submits.
          await this.write(id, row, true);
        }
        const result: CloneAttemptResult = row.status === "accepted"
          ? this.hasJob(owner, row.jobId!) ? { status: "accepted", jobId: row.jobId! } : { status: "expired" }
          : row.status === "pending" ? { status: this.active.has(id) ? "pending" : "expired" } : { status: "not-accepted" };
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      });
    } catch { return failure(503, "clone attempt reconciliation is unavailable; do not resubmit"); }
  }
  async submit(owner: string, id: string, request: unknown, run: () => Promise<Response>): Promise<Response> {
    if (!validId(id)) return failure(400, "invalid clone attempt id");
    const digest = hash(canonical(request));
    try {
      const admission = await this.exclusive(async (): Promise<{ response: Response } | { work: Promise<Response> }> => {
        const existing = await this.read(id);
        if (existing) {
          if (existing.owner !== hash(owner)) return { response: failure(404, "clone attempt not found") };
          if (existing.digest !== digest) return { response: failure(409, "clone attempt cannot be reused for a different request") };
          if (existing.status === "accepted") return { response: this.hasJob(owner, existing.jobId!)
            ? Response.json({ jobId: existing.jobId }, { status: 202, headers: { "cache-control": "no-store" } }) : failure(410, "clone attempt has expired; do not resubmit") };
          const work = this.active.get(id);
          return work ? { work } : { response: failure(409, "clone attempt is fenced or unresolved; reconcile before continuing") };
        }
        const row: RecordValue = { version: 1, owner: hash(owner), digest, status: "pending" };
        // Persist admission before the existing route may create files/jobs.
        await this.write(id, row, true);
        const work = Promise.resolve().then(run).then(async response => {
          if (response.status === 202) {
            const result = await response.clone().json() as { jobId?: unknown };
            if (typeof result.jobId !== "string" || !result.jobId) throw new Error("Invalid clone acceptance");
            await this.exclusive(() => this.write(id, { ...row, status: "accepted", jobId: result.jobId as string }));
          } else if ([400, 403, 404, 409, 429].includes(response.status)) {
            await this.exclusive(() => this.write(id, { ...row, status: "not-accepted" }));
          }
          return response;
        }).catch(() => failure(503, "clone acceptance could not be confirmed; reconcile before continuing"))
          .finally(() => this.active.delete(id));
        this.active.set(id, work);
        return { work };
      });
      return "response" in admission ? admission.response : (await admission.work).clone();
    } catch { return failure(503, "clone admission is unavailable; reconcile before continuing"); }
  }
}
