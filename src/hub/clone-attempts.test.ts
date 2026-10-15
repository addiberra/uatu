import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CloneAttemptStore } from "./clone-attempts";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(capacity?: number) {
  const root = await mkdtemp(path.join(os.tmpdir(), "uatu-clone-attempt-")); roots.push(root);
  const jobs = new Set<string>();
  return { root, jobs, store: new CloneAttemptStore(root, (_, id) => jobs.has(id), capacity) };
}
test("concurrent duplicate admission creates one job, replays original acceptance, and rejects conflicts/other owners", async () => {
  const { store, jobs, root } = await fixture(); let starts = 0, release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const run = async () => { starts++; await wait; jobs.add("job-1"); return Response.json({ jobId: "job-1" }, { status: 202 }); };
  const first = store.submit("owner", "attempt-one", { url: "https://private.invalid/repo", credentialId: "private-id" }, run);
  while (!starts) await new Promise(resolve => setTimeout(resolve, 1));
  expect(await (await store.reconcile("owner", "attempt-one")).json()).toEqual({ status: "pending" });
  const duplicate = store.submit("owner", "attempt-one", { credentialId: "private-id", url: "https://private.invalid/repo" }, run);
  expect((await store.submit("owner", "attempt-one", { url: "different" }, run)).status).toBe(409);
  expect((await store.reconcile("other-owner", "attempt-one")).status).toBe(404);
  expect((await store.submit("other-owner", "attempt-one", {}, run)).status).toBe(404);
  release();
  expect(await (await first).json()).toEqual({ jobId: "job-1" });
  expect(await (await duplicate).json()).toEqual({ jobId: "job-1" });
  expect(starts).toBe(1);
  expect(await (await store.reconcile("owner", "attempt-one")).json()).toEqual({ status: "accepted", jobId: "job-1" });
  const persisted = await readFile(path.join(root, (await readdir(root))[0]!), "utf8");
  expect(persisted).not.toContain("private"); expect(persisted).not.toContain('"owner":"owner"');
});
test("reconciliation fences unknown attempts durably before reporting not-accepted", async () => {
  const { store, root } = await fixture(); let starts = 0;
  expect(await (await store.reconcile("owner", "attempt-fence")).json()).toEqual({ status: "not-accepted" });
  const restarted = new CloneAttemptStore(root, () => false);
  expect(await (await restarted.reconcile("owner", "attempt-fence")).json()).toEqual({ status: "not-accepted" });
  expect((await restarted.submit("owner", "attempt-fence", {}, async () => { starts++; return Response.json({}); })).status).toBe(409);
  expect(starts).toBe(0);
});
test("lost response and job expiry/restart never allow the original attempt to execute again", async () => {
  const { store, jobs, root } = await fixture(); let starts = 0;
  const run = async () => { starts++; jobs.add("job"); return Response.json({ jobId: "job" }, { status: 202 }); };
  await store.submit("owner", "attempt-lost", {}, run);
  expect(await (await store.reconcile("owner", "attempt-lost")).json()).toEqual({ status: "accepted", jobId: "job" });
  jobs.clear();
  expect(await (await store.reconcile("owner", "attempt-lost")).json()).toEqual({ status: "expired" });
  expect((await new CloneAttemptStore(root, () => false).submit("owner", "attempt-lost", {}, run)).status).toBe(410);
  expect(starts).toBe(1);
});
test("unresolved execution or failed acceptance persistence stays expired/unavailable, never nonacceptance", async () => {
  const { store, root } = await fixture(); let starts = 0;
  const run = async () => { starts++; throw new Error("lost acceptance"); };
  expect((await store.submit("owner", "attempt-unknown", {}, run)).status).toBe(503);
  expect(await (await new CloneAttemptStore(root, () => false).reconcile("owner", "attempt-unknown")).json()).toEqual({ status: "expired" });
  expect((await store.submit("owner", "attempt-unknown", {}, run)).status).toBe(409);
  expect(starts).toBe(1);
});
test("definitive preflight refusal fences attempt and corrupted/capacity-limited stores fail closed", async () => {
  const { store, root } = await fixture(1);
  expect((await store.submit("owner", "attempt-refused", {}, async () => Response.json({}, { status: 409 }))).status).toBe(409);
  expect(await (await store.reconcile("owner", "attempt-refused")).json()).toEqual({ status: "not-accepted" });
  expect((await store.reconcile("owner", "another-attempt")).status).toBe(503);
  await writeFile(path.join(root, (await readdir(root))[0]!), "corrupt");
  expect((await store.reconcile("owner", "attempt-refused")).status).toBe(503);
  let starts = 0;
  expect((await store.submit("owner", "attempt-refused", {}, async () => { starts++; return Response.json({}); })).status).toBe(503);
  expect(starts).toBe(0);
});
test("invalid attempt IDs cannot write outside the store", async () => {
  const { store, root } = await fixture();
  for (const id of ["../escape", "short", "a".repeat(129), "%2fescape"]) expect((await store.reconcile("owner", id)).status).toBe(400);
  expect(await readdir(root)).toEqual([]);
});
test("failure to persist acceptance never turns an executed job into nonacceptance", async () => {
  const { store, root, jobs } = await fixture();
  const backup = `${root}-backup`; roots.push(backup);
  const result = await store.submit("owner", "attempt-write-fails", {}, async () => {
    jobs.add("accepted-before-disk-failure");
    await rename(root, backup); await writeFile(root, "unavailable store");
    return Response.json({ jobId: "accepted-before-disk-failure" }, { status: 202 });
  });
  expect(result.status).toBe(503);
  expect((await store.reconcile("owner", "attempt-write-fails")).status).toBe(503);
  await rm(root); await rename(backup, root);
  expect(await (await new CloneAttemptStore(root, () => false).reconcile("owner", "attempt-write-fails")).json()).toEqual({ status: "expired" });
  let replayed = false;
  expect((await store.submit("owner", "attempt-write-fails", {}, async () => { replayed = true; return Response.json({}); })).status).toBe(409);
  expect(replayed).toBe(false);
});
