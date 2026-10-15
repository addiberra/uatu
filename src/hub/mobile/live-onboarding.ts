import type { CoordinatedResult, MobileHubBackend, OnboardingOutcome, WorkspaceRuntime } from "./backend";
import { decodeDefaultFolder } from "./live-read-model";
import type { LiveTransport } from "./live-transport";
import { array, boolean, nonempty, object, workspaceEntry } from "./live-values";
import type { RenameFolderResult, RemoveFolderResult } from "../folder-manager";

const onboardingCodes = ["invalid-input", "not-found", "conflict", "needs-init", "credential", "git-init", "internal", "recovery-pending", "recovery-required"] as const;
function onboardingFailure(value: unknown, status: number): OnboardingOutcome | undefined {
  const row = object(value);
  const code = row.needsInit === true ? "needs-init" : onboardingCodes.find(code => code === row.code);
  if (!code) return undefined;
  return { status: "failed", code, message: code === "needs-init" ? "This folder is not a Git repository. Confirm Git initialization to continue." : "Workspace configuration could not complete. Review the retained folder and registration before retrying.",
    ...(row.retainedPath === undefined ? {} : { retainedPath: nonempty(row.retainedPath) }) };
}
function onboardingSuccess(createdFolder: boolean) {
  return (value: unknown): OnboardingOutcome => {
    const row = object(value), entry = workspaceEntry(row.workspace);
    const started = boolean(row.started);
    if (boolean(object(row.workspace).running) !== started || (row.startError !== null && typeof row.startError !== "string") || (started && row.startError !== null)) throw new Error("Invalid onboarding outcome");
    if (row.recoveryRequired !== undefined) {
      if (started || typeof row.recoveryRequired !== "string") throw new Error("Invalid recovery outcome");
      return { status: "failed", code: "recovery-required", message: "The workspace is registered and stopped. The Hub requires recovery before further changes or starts; ask its operator to restart it.", committedEntry: entry, retainedPath: entry.path };
    }
    return { status: "configured", result: { entry, created: true, alreadyRegistered: false, createdFolder,
      ...(started ? { started: true, startError: null } : { started: false, startError: row.startError === null ? null : "Workspace configuration was saved, but the requested start failed. Review credentials and Hub availability before starting again." }) } };
  };
}
function needsStop(value: unknown, status: number): { status: "needs-stop"; workspaceIds: string[] } | undefined {
  const row = object(value);
  return status === 409 && row.needsStop === true ? { status: "needs-stop", workspaceIds: array(row.workspaceIds, nonempty) } : undefined;
}
export function createLiveOnboarding(transport: LiveTransport): Pick<MobileHubBackend, "readDefaultFolder" | "setDefaultFolder" | "browseFolders" | "configureExisting" | "createWorkspace" | "createFolder" | "renameFolder" | "removeEmptyFolder"> {
  return {
    readDefaultFolder: () => transport.read("/api/hub/settings/workspace-defaults", decodeDefaultFolder),
    setDefaultFolder: path => transport.request("/api/hub/settings/workspace-defaults", decodeDefaultFolder, { defaultWorkspaceParent: path }),
    browseFolders: path => transport.read(`/api/hub/browse${path === undefined ? "" : `?path=${encodeURIComponent(path)}`}`, value => {
      const row = object(value), location = nonempty(row.path);
      return { path: location, parent: row.parent === null ? null : nonempty(row.parent), directories: array(row.dirs, value => {
        const dir = object(value), name = nonempty(dir.name), git = boolean(dir.git), running = boolean(dir.running);
        if (name.includes("/") || name === "." || name === "..") throw new Error("Invalid child directory");
        if (dir.registeredId === null) {
          if (running || dir.displayName !== null) throw new Error("Invalid unregistered folder");
          return { name, git, registration: { status: "unregistered" as const } };
        }
        const runtime: WorkspaceRuntime = running ? { status: "running", shells: { status: "loading" } } : { status: "stopped" };
        return { name, git, registration: { status: "registered" as const, workspace: { id: nonempty(dir.registeredId), displayName: nonempty(dir.displayName), path: `${location.replace(/\/$/, "")}/${name}`, backend: "local" as const }, runtime } };
      }) };
    }),
    configureExisting: intent => transport.request("/api/hub/workspaces/configure", onboardingSuccess(false), intent, true, onboardingFailure),
    createWorkspace: intent => {
      if (intent.gitInitConsent !== "confirmed") return Promise.resolve({ status: "rejected", problem: { kind: "invalid-input", message: "Git initialization requires explicit consent." } });
      const { gitInitConsent, ...body } = intent;
      return transport.request("/api/hub/workspaces/create", onboardingSuccess(true), body, true, onboardingFailure);
    },
    createFolder: intent => transport.request("/api/hub/folders/create", value => ({ path: nonempty(object(value).path) }), intent),
    renameFolder: intent => transport.request<CoordinatedResult<RenameFolderResult>>("/api/hub/folders/rename", value => ({ status: "completed" as const, value: { path: nonempty(object(value).path), workspaceIds: array(object(value).workspaceIds, nonempty) } }), { path: intent.path, name: intent.name, stop: intent.stop === "stop-dependent-workspaces" }, true, needsStop),
    removeEmptyFolder: intent => transport.request<CoordinatedResult<RemoveFolderResult>>("/api/hub/folders/remove", value => {
      const row = object(value);
      return { status: "completed" as const, value: { path: nonempty(row.path), ...(row.workspaceId === undefined ? {} : { workspaceId: nonempty(row.workspaceId) }) } };
    }, { path: intent.path, stop: intent.stop === "stop-dependent-workspaces" }, true, needsStop),
  };
}
