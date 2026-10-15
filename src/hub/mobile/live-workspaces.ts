import type { MobileHubBackend, ReadResult, WorkspaceView } from "./backend";
import { decodeCredentialCatalog, decodeHubState } from "./live-read-model";
import type { LiveTransport } from "./live-transport";

export function createLiveWorkspaceReads(transport: LiveTransport): Pick<MobileHubBackend, "readWorkspaces" | "readWorkspace"> {
  async function readWorkspaces(): Promise<ReadResult<WorkspaceView[]>> {
    const generation = transport.generation();
    const [state, catalog] = await Promise.all([
      transport.read("/api/hub/state", decodeHubState), transport.read("/api/hub/credentials", decodeCredentialCatalog),
    ]);
    if (generation !== transport.generation()) return { status: "unavailable", problem: { kind: "unavailable", message: "Hub state changed while loading workspaces." } };
    if (state.status === "unavailable") return state;
    // Unknown assignments must never become an empty list and an unassigned Start.
    if (catalog.status === "unavailable") return catalog;
    if (state.value.workspaces.some(row => row.parentId && !state.value.workspaces.some(parent => parent.id === row.parentId && !parent.parentId))) {
      return { status: "unavailable", problem: { kind: "unavailable", message: "The credential policy owner could not be verified." } };
    }
    return { status: "available", value: state.value.workspaces.map(row => {
      const { id, displayName, path, backend, parentId, repositoryId, availability, ownership, sourceRef, createWorktree } = row;
      return {
        id, displayName, path, backend, parentId, repositoryId, availability, ownership, sourceRef, createWorktree,
        runtime: row.running ? { status: "running" as const, shells: row.shells
          ? { status: "ready" as const, value: row.shells }
          : { status: "unavailable" as const, problem: { kind: "unavailable" as const, message: "Shell inventory is unavailable." } } } : { status: "stopped" as const },
        branch: row.checkout ?? { kind: "unavailable" as const, message: "Checkout metadata is unavailable." },
        assignments: catalog.value.flatMap(credential => credential.assignments.filter(assignment => assignment.workspaceId === (parentId ?? id))),
        credentialRestartRequired: row.credentialRestartRequired, workspaceApiRevision: row.workspaceApiRevision,
      };
    }) };
  }
  return {
    readWorkspaces,
    async readWorkspace(id) {
      const result = await readWorkspaces();
      if (result.status === "unavailable") return result;
      const workspace = result.value.find(row => row.id === id);
      return workspace ? { status: "available", value: workspace } : { status: "unavailable", problem: { kind: "not-found", message: "Workspace registration was not found." } };
    },
  };
}
