import type { MobileHubBackend, WorkspaceView } from "./backend";
import { createFlowEnvironment, text, type FlowEnvironment, type MobileHubDetail, type SheetPort } from "./flow-ui";
import type { MobileNotificationSettings } from "./notifications";
import { createCredentialFlows } from "./credential-flows";
import { createWorkspaceFlows } from "./workspace-flows";
import { createOnboardingFlows } from "./onboarding-flows";
import { createCloneFlow } from "./clone-flow";
import { createAgentAccountFlows } from "./agent-account-flows";
export type { MobileHubDetail } from "./flow-ui";

export function createMobileHubFlows(root: HTMLElement, backend: MobileHubBackend, sheet: SheetPort, hooks: {
  user(): string; home(): void; changed(): void; authLost(): void; openWorkspace(id: string): void; startWorkspace(w: WorkspaceView): void;
  authContext?(): { user: string; current(): boolean };
  detailChanged?(detail: MobileHubDetail | null, parent?: "repository-credentials"): void;
  notifications?: MobileNotificationSettings;
  repositoryCredentials(env: FlowEnvironment): void;
}) {
  let detail: MobileHubDetail | null = null;
  let repositoryParent = false;
  const repositoryChild = (next: MobileHubDetail) => ["credential", "add-credential", "tools", "assignments"].includes(next.kind);
  const owner = createFlowEnvironment(root, backend, sheet, { ...hooks, home: () => {
    if (repositoryParent) show({ kind: "repository-credentials" }, true);
    else { leave(); hooks.home(); hooks.detailChanged?.(null); }
  }, navigate: next => show(next, true) });
  const credentials = createCredentialFlows(owner.env);
  const workspaces = createWorkspaceFlows(owner.env, hooks.startWorkspace);
  const onboarding = createOnboardingFlows(owner.env, credentials.setup, hooks.startWorkspace);
  const clone = createCloneFlow(owner.env, credentials.unlock, path => { show({ kind: "folders" }, true); onboarding.browse(path, undefined, () => show({ kind: "clone" }, true)); }, credentials.setup);
  const accounts = createAgentAccountFlows(owner.env);
  let disposeNotifications = () => {};
  const stopNotifications = () => { disposeNotifications(); disposeNotifications = () => {}; };
  function show(next: MobileHubDetail, notify = false, restoredParent?: "repository-credentials") {
    repositoryParent = repositoryChild(next) && (restoredParent === "repository-credentials" || detail?.kind === "repository-credentials" || repositoryParent);
    clone.hide(); accounts.stop(); stopNotifications(); sheet.close(); owner.begin(); detail = next;
    if (notify) hooks.detailChanged?.(next, repositoryParent ? "repository-credentials" : undefined);
    switch (next.kind) {
      case "repository-credentials": hooks.repositoryCredentials(owner.env); break;
      case "notifications": {
        const page = owner.env.page("Notifications", hooks.notifications ? '<div data-notification-settings></div>' : text("Notification enrollment is unavailable in this environment. No browser permission or subscription has been requested."));
        if (hooks.notifications) disposeNotifications = hooks.notifications(page.querySelector<HTMLElement>("[data-notification-settings]")!, owner.env.current(), hooks.authLost);
        break;
      }
      case "agent-accounts": accounts.show(); break;
      case "agent": accounts.show(next.id); break;
      case "credential": credentials.detail(next.id); break;
      case "workspace": workspaces.workspace(next.id); break;
      case "add-credential": credentials.chooser(); break;
      case "tools": credentials.tools(); break;
      case "assignments": workspaces.assignments(); break;
      case "devices": workspaces.devices(); break;
      case "security": workspaces.security(); break;
      case "default-folder": onboarding.defaultFolder(); break;
      case "add-workspace": onboarding.add(); break;
      case "folders": onboarding.browse(); break;
      case "clone": clone.show(); break;
    }
  }
  function leave() { detail = null; repositoryParent = false; clone.hide(); accounts.stop(); stopNotifications(); owner.leave(); }
  return {
    show, leave, refresh: owner.refresh,
    get detail() { return detail; },
    workspaceInvalidated(id: string) { if (detail && ((detail.kind === "workspace" && detail.id === id) || detail.kind === "assignments")) show(detail); },
    invalidate() { detail = null; repositoryParent = false; clone.reset(); accounts.stop(); stopNotifications(); owner.invalidate(); },
    destroy() { clone.reset(); accounts.stop(); stopNotifications(); owner.invalidate(); },
  };
}
