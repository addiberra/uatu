import { expect, test } from "bun:test";
import type { WorkspaceView } from "./backend";
import { mobileWorkspaceGroups } from "./workspace-groups";
const workspace = (id: string, extra: Partial<WorkspaceView> = {}): WorkspaceView => ({ id, displayName: "Duplicate", backend: "local", path: `/projects/${id}`, runtime: { status: "stopped" }, branch: { kind: "unavailable", message: "Unknown" }, assignments: [], credentialRestartRequired: false, workspaceApiRevision: 24, ...extra });
test("single checkout remains one compact card; duplicate names never combine projects", () => {
  const groups = mobileWorkspaceGroups([workspace("a"), workspace("b")]);
  expect(groups).toHaveLength(2); expect(groups.map(group => group.checkouts.length)).toEqual([1, 1]);
});
test("authoritative family combines mixed lifecycle checkouts independently of ordering and names", () => {
  const main = workspace("main", { repositoryId: "family" }), child = workspace("child", { parentId: "main", repositoryId: "family", runtime: { status: "running", shells: { status: "loading" } }, branch: { kind: "detached", commit: "a".repeat(40) } });
  const [group] = mobileWorkspaceGroups([child, main]);
  expect(group).toMatchObject({ id: "repository:family", main: { id: "main" }, running: true });
  expect(group!.checkouts.map(w => w.id)).toEqual(["main", "child"]);
  expect(mobileWorkspaceGroups([{ ...main, displayName: "Renamed" }, child])[0]!.id).toBe(group!.id);
});
test("unknown or missing parents do not fabricate family identity and availability survives grouping", () => {
  const groups = mobileWorkspaceGroups([workspace("a", { parentId: "missing", availability: "replaced" }), workspace("b", { parentId: "missing", availability: "missing" })]);
  expect(groups).toHaveLength(2);
  expect(groups.map(g => g.checkouts[0]!.availability)).toEqual(["replaced", "missing"]);
});
