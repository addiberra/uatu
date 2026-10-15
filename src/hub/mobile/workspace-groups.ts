import type { WorkspaceView } from "./backend";

export type MobileWorkspaceGroup = { id: string; main: WorkspaceView; checkouts: WorkspaceView[]; running: boolean };
/** Authoritative repository/parent identities only. Similar labels and paths
 * never combine unrelated projects. Disclosure keys survive rename/refresh. */
export function mobileWorkspaceGroups(workspaces: WorkspaceView[]): MobileWorkspaceGroup[] {
  const byId = new Map(workspaces.map(workspace => [workspace.id, workspace]));
  const groups = new Map<string, MobileWorkspaceGroup>();
  for (const workspace of workspaces) {
    const parent = workspace.parentId ? byId.get(workspace.parentId) : undefined;
    const id = workspace.repositoryId ? `repository:${workspace.repositoryId}`
      : parent?.repositoryId ? `repository:${parent.repositoryId}` : `workspace:${parent?.id ?? workspace.id}`;
    let group = groups.get(id);
    if (!group) { group = { id, main: parent ?? workspace, checkouts: [], running: false }; groups.set(id, group); }
    group.checkouts.push(workspace);
    if (!workspace.parentId) group.main = workspace;
    group.running ||= workspace.runtime.status === "running";
  }
  return [...groups.values()].map(group => ({ ...group, checkouts: [...group.checkouts].sort((a, b) => Number(b.id === group.main.id) - Number(a.id === group.main.id)) }));
}
