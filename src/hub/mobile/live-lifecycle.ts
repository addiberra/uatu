import type { KeyTarget, MobileHubBackend, OperationResult, StartWorkspaceResult } from "./backend";
import type { LiveTransport } from "./live-transport";
import { boolean, object, workspaceEntry } from "./live-values";

export function createLiveLifecycle(transport: LiveTransport, reads: Pick<MobileHubBackend, "readWorkspace" | "readCredentials">): Pick<MobileHubBackend, "startWorkspace" | "stopWorkspace" | "renameWorkspace" | "forgetWorkspace"> {
  return {
    async startWorkspace(intent): Promise<OperationResult<StartWorkspaceResult>> {
      const generation = transport.generation();
      const workspaceGeneration = transport.workspaceGeneration(intent.workspaceId);
      const current = () => generation === transport.generation() && workspaceGeneration === transport.workspaceGeneration(intent.workspaceId);
      const changed = (): OperationResult<StartWorkspaceResult> => ({ status: "rejected", problem: { kind: "conflict", message: "Hub state changed before Start. Review its current state." } });
      const workspace = await reads.readWorkspace(intent.workspaceId);
      if (!current()) return changed();
      if (workspace.status === "unavailable") return { status: "rejected", problem: workspace.problem };
      if (workspace.value.availability) return { status: "rejected", problem: { kind: "conflict", message: "This checkout is missing or replaced. Inspect its worktree inventory before starting it." } };
      if (workspace.value.runtime.status === "running") return { status: "completed", value: { status: "running", workspaceId: intent.workspaceId } };
      if (!workspace.value.assignments.length && intent.unassigned !== "confirmed-without-credentials") return { status: "completed", value: { status: "confirm-unassigned", workspaceId: intent.workspaceId } };
      if (workspace.value.assignments.length) {
        const catalog = await reads.readCredentials();
        if (!current()) return changed();
        if (catalog.status === "unavailable") return { status: "rejected", problem: catalog.problem };
        const locked: KeyTarget[] = [];
        for (const id of new Set(workspace.value.assignments.map(row => row.credentialId))) {
          const credential = catalog.value.find(row => row.id === id);
          if (!credential || !credential.enabled) return { status: "rejected", problem: { kind: "conflict", message: "An assigned credential is missing or disabled. Review workspace credentials." } };
          if (credential.type !== "token" && credential.facts?.lock === "locked") locked.push({ id, type: credential.type });
        }
        if (locked.length) return { status: "completed", value: { status: "requires-unlock", credentials: locked as [KeyTarget, ...KeyTarget[]] } };
      }
      if (!current()) return changed();
      return transport.request(`/api/hub/sessions/${encodeURIComponent(intent.workspaceId)}/start`, value => {
        const row = object(value);
        if (row.id !== intent.workspaceId || row.running !== true) throw new Error("Invalid start result");
        return { status: "running", workspaceId: intent.workspaceId };
      }, {});
    },
    async stopWorkspace(id) {
      const result = await transport.request(`/api/hub/sessions/${encodeURIComponent(id)}/stop`, value => {
        const row = object(value);
        if (row.id !== id || row.running !== false) throw new Error("Invalid stop result");
        return { status: boolean(row.wasRunning) ? "stopped" as const : "already-stopped" as const };
      }, {});
      if (result.status === "completed") transport.workspaceChanged(id, "stopped");
      return result;
    },
    renameWorkspace: intent => transport.request(`/api/hub/workspaces/${encodeURIComponent(intent.workspaceId)}/display-name`, value => {
      const workspace = workspaceEntry(object(value).workspace);
      if (workspace.id !== intent.workspaceId) throw new Error("Workspace identity mismatch");
      return workspace;
    }, { displayName: intent.displayName }),
    async forgetWorkspace(id) {
      const result = await transport.request(`/api/hub/workspaces/${encodeURIComponent(id)}/forget`, value => {
        if (object(value).forgotten !== true || object(value).id !== id) throw new Error("Invalid forget result");
        return { status: "forgotten" as const };
      }, {});
      if (result.status === "completed") transport.workspaceChanged(id, "removed");
      return result;
    },
  };
}
