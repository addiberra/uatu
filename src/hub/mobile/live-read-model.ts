import { parsePublicCredentialDto } from "../credential-types";
import type { PublicCredentialDto } from "../credential-types";
import type { DefaultWorkspaceParentState } from "../preferences";
import type { WorkspaceEntry } from "../registry";
import type { HubApiCompatibility } from "../../shared/types";

/** Decoded current wire facts, NOT WorkspaceView or AuthenticationState.
 * Missing optional facts remain absent (unknown), not false/empty/non-Git.
 * The current API cannot supply the complete mobile branch/identity contract. */
export type HubWorkspaceSnapshot = Pick<WorkspaceEntry, "id" | "displayName" | "path" | "backend"> & {
  running: boolean;
  credentialRestartRequired: boolean;
  workspaceApiRevision: number;
  // Public names, NOT ids, readiness, or the child's inherited assignments.
  credentialAssignments: { authentication: string[]; signing: string[] };
  shells?: Array<{ attached: boolean; label: string }>;
  parentId?: string;
  repositoryId?: string;
  // A reported label: server.ts can fall back to a linked checkout's display
  // name. Do not promote this to BranchState.named or infer unborn/non-Git.
  branch?: string;
  detached?: true;
  sourceRef?: string;
  ownership?: "uatu" | "external" | "uncertain";
  availability?: "missing" | "replaced";
  createWorktree?: true;
};

export type HubStateSnapshot = HubApiCompatibility & {
  version: string;
  workspaces: HubWorkspaceSnapshot[];
  workspaceDefaults?: DefaultWorkspaceParentState;
  worktreeApi?: string;
};

function invalid(): never { throw new Error("Invalid Hub read payload"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") return invalid();
  return value;
}
function nonempty(value: unknown): string {
  const result = text(value);
  if (!result.trim() || result.includes("\0")) return invalid();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
}
function array<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) return invalid();
  return value.map(decode);
}
function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) return invalid();
  return value;
}
function unique<T>(values: T[], key: (value: T) => string): T[] {
  if (new Set(values.map(key)).size !== values.length) return invalid();
  return values;
}

export function decodeDefaultFolder(value: unknown): DefaultWorkspaceParentState {
  const row = object(value);
  return {
    configured: row.configured === null ? null : nonempty(row.configured),
    configuredAvailable: boolean(row.configuredAvailable),
    effective: nonempty(row.effective),
  };
}

function decodeWorkspace(value: unknown): HubWorkspaceSnapshot {
  const row = object(value);
  const assignments = object(row.credentialAssignments);
  const result: HubWorkspaceSnapshot = {
    id: nonempty(row.id), displayName: nonempty(row.displayName), path: nonempty(row.path),
    backend: oneOf(row.backend, ["local"]), running: boolean(row.running),
    credentialRestartRequired: boolean(row.credentialRestartRequired),
    workspaceApiRevision: revision(row.workspaceApiRevision),
    credentialAssignments: {
      authentication: unique(array(assignments.authentication, nonempty), name => name),
      signing: unique(array(assignments.signing, nonempty), name => name),
    },
  };
  if (row.shells !== undefined) result.shells = array(row.shells, item => {
    const shell = object(item);
    return { attached: boolean(shell.attached), label: text(shell.label) };
  });
  for (const key of ["parentId", "repositoryId", "branch", "sourceRef"] as const) {
    if (row[key] !== undefined) result[key] = nonempty(row[key]);
  }
  for (const key of ["detached", "createWorktree"] as const) {
    if (row[key] !== undefined) {
      if (row[key] !== true) return invalid();
      result[key] = true;
    }
  }
  if (row.ownership !== undefined) result.ownership = oneOf(row.ownership, ["uatu", "external", "uncertain"]);
  if (row.availability !== undefined) result.availability = oneOf(row.availability, ["missing", "replaced"]);
  return result;
}

/** Project only supported fields; never retain arbitrary response properties. */
export function decodeHubState(value: unknown): HubStateSnapshot {
  const row = object(value);
  const result: HubStateSnapshot = {
    version: text(row.version),
    hubApiRevision: revision(row.hubApiRevision),
    workspaceApiRevision: revision(row.workspaceApiRevision),
    workspaces: unique(array(row.workspaces, decodeWorkspace), workspace => workspace.id),
  };
  if (row.workspaceDefaults !== undefined) result.workspaceDefaults = decodeDefaultFolder(row.workspaceDefaults);
  // Retained as capability data, not used as a fetch destination by this reader.
  if (row.worktreeApi !== undefined) result.worktreeApi = nonempty(row.worktreeApi);
  return result;
}

export function decodeCredentialCatalog(value: unknown): PublicCredentialDto[] {
  const credentials = array(object(value).credentials, parsePublicCredentialDto);
  for (const credential of credentials) {
    if (credential.assignments.some(assignment => assignment.credentialId !== credential.id)) return invalid();
  }
  // The existing public parser validates type-specific capabilities, metadata,
  // assignments and readiness and rejects private/unknown credential fields.
  // It does not infer protection, lock or OpenPGP user IDs from diagnostic text.
  return unique(credentials, credential => credential.id);
}
