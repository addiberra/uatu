import { parseWorktreeDeletionPreflight, parseWorktreeEndpointResult, parseWorktreeInventoryResponse, parseWorktreeRefsResponse } from "../../shared/worktree-contract";
import type { LiveTransport } from "./live-transport";
import type { MobileWorktrees } from "./worktrees";

export function createLiveWorktrees(transport: LiveTransport): MobileWorktrees {
  const api = "/api/hub/worktrees";
  return {
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
