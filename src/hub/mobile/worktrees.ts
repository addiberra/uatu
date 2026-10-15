import type { WorktreeCreateRequest, WorktreeDeleteRequest, WorktreeDeletionPreflight, WorktreeForgetRequest, WorktreeInventory, WorktreeOperationResult, WorktreePreflightDeleteRequest, WorktreeRefsResponse, WorktreeRegisterRequest } from "../../shared/worktree-contract";
import type { OperationResult, ReadResult } from "./backend";

/** Existing worktree service contract, not a parallel Git/lifecycle owner. */
export interface MobileWorktrees {
  inventory(sourceWorkspaceId: string): Promise<ReadResult<WorktreeInventory>>;
  fetch(sourceWorkspaceId: string): Promise<OperationResult<WorktreeRefsResponse>>;
  create(intent: WorktreeCreateRequest): Promise<OperationResult<WorktreeOperationResult>>;
  open(intent: WorktreeRegisterRequest): Promise<OperationResult<WorktreeOperationResult>>;
  register(intent: WorktreeRegisterRequest): Promise<OperationResult<WorktreeOperationResult>>;
  forget(intent: WorktreeForgetRequest): Promise<OperationResult<WorktreeOperationResult>>;
  preflightDelete(intent: WorktreePreflightDeleteRequest): Promise<OperationResult<WorktreeDeletionPreflight>>;
  delete(intent: WorktreeDeleteRequest & { confirm: true }): Promise<OperationResult<WorktreeOperationResult>>;
}
