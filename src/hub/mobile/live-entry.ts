import { appBasePath, hubUrl, isHubPage, workspaceIdFromBasePath } from "../../shared/app-url";
import { mountMobileHub } from "./frontend";
import { mountMobileCoordinator, mobileHubDetail, mobileHubPath, mobileHubRoute } from "./coordinator";
import { createLiveBackendRuntime } from "./live-backend";
import { liveNotificationSettings } from "./notifications";
import { confirmAuthenticatedHubContext, onHubAvailabilityChange } from "../../shell/hub-nav";
import { onCurrentSessionRunning } from "../../shell/session-running";
import { liveChannel, registerRecoveryWork } from "../../shell/live";
import { createTaskHistory } from "./task-history";
import { unregisterLegacyServiceWorkers } from "../../shell/pwa";
import "./styles.css";
import "./coordinator.css";

export function eligibleMobileHub(): boolean {
  return isHubPage() && document.documentElement.dataset.uiMode === "touch";
}

/** Direct Hub entry owns no workspace, stream, or fabricated Return target.
 * Canonical Open crosses a document boundary; its workspace entry owns retention. */
export function mountLiveHub(root: HTMLElement) {
  const { backend, transport } = createLiveBackendRuntime();
  const tasks = createTaskHistory(history, () => location.href);
  let restoring = false, context: string | undefined, authenticated = true;
  let disposed = false, navigationIntent = 0;
  const navigateWorkspace = async (id: string) => {
    const intent = ++navigationIntent, generation = transport.generation();
    // Dismissal may already have scheduled an owned history.back(). Let it
    // land before leaving this document, or it can abort/bounce the new entry.
    await tasks.settled();
    if (!disposed && authenticated && intent === navigationIntent && generation === transport.generation()) location.assign(`/s/${encodeURIComponent(id)}/`);
  };
  const show = () => { const url = new URL(location.href); restoring = true; try { view.show(mobileHubRoute(url) ?? "hub", mobileHubDetail(url)); } finally { restoring = false; } };
  const view = mountMobileHub(root, backend, {
    brandLogoUrl: hubUrl("/hub-assets/logo.svg"),
    authenticationLost: () => { authenticated = false; navigationIntent++; },
    authenticated: () => { authenticated = true; },
    notifications: liveNotificationSettings(),
    navigateWorkspace: id => { void navigateWorkspace(id); },
    returnToWorkspace: id => { void navigateWorkspace(id); },
    setRoute(route) { navigationIntent++; tasks.write({ mobileHub: { route } }, mobileHubPath(route), false); show(); },
    detailChanged(detail) {
      navigationIntent++;
      const route = mobileHubRoute(new URL(location.href)) ?? "settings", path = mobileHubPath(route, detail);
      if (detail && !mobileHubDetail(new URL(path, location.origin))) return;
      tasks.write({ mobileHub: { route } }, path, false);
    },
    taskChanged(open) {
      context = open ? new URL(tasks.contextUrl, location.href).href : undefined;
      if (restoring) return;
      if (open) tasks.open({ route: mobileHubRoute(new URL(location.href)) ?? "hub" }); else tasks.close();
    },
  });
  const pop = () => {
    if (tasks.consumePop()) return;
    navigationIntent++;
    if (view.hasTask && context === location.href) {
      restoring = true;
      try { if (view.cancelTaskFromHistory() === "blocked" || view.hasTask) tasks.open({ route: mobileHubRoute(new URL(location.href)) ?? "hub" }); }
      finally { restoring = false; }
    } else show();
  };
  const refresh = () => { if (authenticated && document.visibilityState !== "hidden") void view.refresh(); };
  const timer = setInterval(refresh, 5000);
  window.addEventListener("popstate", pop);
  window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
  show();
  return { ready: view.ready, destroy() { disposed = true; clearInterval(timer); tasks.destroy(); window.removeEventListener("popstate", pop); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); view.destroy(); } };
}

/** Called before importing app.ts: all workspace URL/history/global-input
 * owners initialize inside this fixed service context exactly once. */
export function mountLiveWorkspace(bootWorkspace: () => Promise<void>) {
  const basePath = appBasePath(), workspaceId = workspaceIdFromBasePath(basePath);
  if (!workspaceId || !eligibleMobileHub()) throw new Error("Not a mobile Hub workspace entry");
  const workspaceRoot = document.createElement("div");
  workspaceRoot.id = "mobile-workspace-root"; workspaceRoot.style.width = "100%";
  for (const node of [...document.body.childNodes]) if (!(node instanceof HTMLScriptElement)) workspaceRoot.append(node);
  document.body.append(workspaceRoot);
  const hubRoot = document.createElement("div");
  hubRoot.id = "mobile-hub-root"; hubRoot.style.cssText = "position:fixed;inset:0;z-index:1000";
  document.body.append(hubRoot);
  const { backend, transport } = createLiveBackendRuntime();
  let reveal = () => {}, disposed = false, checking: Promise<void> | undefined;
  const cleanups: Array<() => void> = [];
  // Stream loss is only a request to revalidate, never a Stop/auth verdict.
  const revalidate = () => checking ??= (async () => {
    const result = await backend.readWorkspace(workspaceId);
    if (disposed) return;
    if (result.status === "available" && result.value.runtime.status === "stopped") transport.workspaceChanged(workspaceId, "stopped");
    else if (result.status === "unavailable" && result.problem.kind === "not-found") transport.workspaceChanged(workspaceId, "removed");
  })().finally(() => { checking = undefined; });
  const coordinator = mountMobileCoordinator({ hubRoot, workspaceRoot, backend, workspaceId, basePath, eligible: eligibleMobileHub,
    notifications: liveNotificationSettings({ workspaceId, beforeRegister: unregisterLegacyServiceWorkers }), revealNavigation: () => reveal(),
    async bootWorkspace() {
      confirmAuthenticatedHubContext();
      cleanups.push(onHubAvailabilityChange(available => { if (!available) transport.invalidate("unauthorized"); }));
      cleanups.push(onCurrentSessionRunning(running => { if (running === false) transport.workspaceChanged(workspaceId, "stopped"); }));
      const channel = liveChannel();
      cleanups.push(channel.onActivity((id, activity) => { if (id === workspaceId && !activity.running) transport.workspaceChanged(id, "stopped"); }));
      cleanups.push(channel.onStatus(status => { if (status !== "live") void revalidate(); }));
      cleanups.push(registerRecoveryWork(revalidate));
      await bootWorkspace();
      const tabs = await import("../../shell/tab-bar"); reveal = tabs.revealWorkspaceNavigation;
      const mode = await import("../../shell/ui-mode");
      cleanups.push(mode.onUiModeChange(next => { if (next === "desktop") location.assign(basePath); }));
    },
  });
  return { ...coordinator, destroy() { disposed = true; for (const cleanup of cleanups) cleanup(); coordinator.destroy(); } };
}
