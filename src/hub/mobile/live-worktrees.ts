import { parseWorktreeDeletionPreflight, parseWorktreeEndpointResult, parseWorktreeInventoryResponse, parseWorktreeRefsResponse } from "../../shared/worktree-contract";
import type { LiveTransport } from "./live-transport";
import type { MobileWorktrees } from "./worktrees";
import { appBasePath, workspaceIdFromBasePath } from "../../shared/app-url";
import { createLiveChannel } from "../../shell/live-channel";
import { createLifecycleRecovery } from "../../shell/recovery";

/** A retained workspace shares its existing brokered channel. A direct Hub
 * has no workspace channel: hold one only while its inventory page is open,
 * using the same channel/recovery owners and no child stream or polling loop. */
function watchInventory(source: string, invalidated: () => void): () => void {
  // hub-nav already owns the workspace's worktrees subscription and DOM
  // invalidation relay. subscribe() replaces, rather than refcounts, a key:
  // never replace or close that background consumer from this task page.
  const retained = workspaceIdFromBasePath(appBasePath());
  if (retained !== null) {
    if (retained === source) return () => {};
    // The wire scopes worktrees to the stream's one workspace. While A is
    // retained, reconcile B's visible inventory at the Hub refresh cadence
    // instead of opening a second stream or retargeting A's subscriptions.
    const refresh = () => { if (document.visibilityState !== "hidden") invalidated(); };
    const timer = setInterval(refresh, 5000);
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }
  const channel = createLiveChannel({
    ws: source, activity: false,
    openSource: url => new EventSource(url), fetcher: (input, init) => fetch(input, init),
  });
  const subscription = channel.subscribe({ topic: "worktrees" }, { data: invalidated });
  const recovery = createLifecycleRecovery({ win: window, doc: document,
    recover: async () => { channel.connect({ resumed: true }); }, release: () => channel.suspend(),
  });
  if (document.visibilityState !== "hidden") channel.connect();
  return () => { recovery.dispose(); subscription.close(); channel.dispose(); };
}

export function createLiveWorktrees(transport: LiveTransport): MobileWorktrees {
  const api = "/api/hub/worktrees";
  return {
    watchInventory,
    inventory: source => transport.read(`${api}?source=${encodeURIComponent(source)}`, value => parseWorktreeInventoryResponse(value).inventory),
    fetch: sourceWorkspaceId => transport.request(`${api}/fetch`, parseWorktreeRefsResponse, { sourceWorkspaceId }),
    create: intent => transport.request(`${api}/create`, value => parseWorktreeEndpointResult(value, "create"), intent),
    open: intent => transport.request(`${api}/open`, value => parseWorktreeEndpointResult(value, "start"), intent),
    register: intent => transport.request(`${api}/register`, value => parseWorktreeEndpointResult(value, "register"), intent),
    forget: intent => transport.request(`${api}/forget`, value => parseWorktreeEndpointResult(value, "forget"), intent),
    preflightDelete: intent => transport.request(`${api}/preflight-delete`, parseWorktreeDeletionPreflight, intent),
    delete: intent => transport.request(`${api}/delete`, value => parseWorktreeEndpointResult(value, "delete"), intent),
  };
}
