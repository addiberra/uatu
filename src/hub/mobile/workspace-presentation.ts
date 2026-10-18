import type { BranchState, WorkspaceView } from "./backend";
import type { PublicCredentialDto } from "../credential-types";

export function branchLabel(branch: BranchState): string {
  switch (branch.kind) {
    case "named": return branch.name;
    case "unborn": return `${branch.name} · no commits`;
    case "detached": return `Detached · ${branch.commit}`;
    case "non-git": return "Not a Git repository";
    case "loading": return "Loading branch…";
    case "unavailable": return `Branch unavailable: ${branch.message}`;
  }
}
/** Dashboard card copy: short facts only. The verbose branchLabel message stays
 * reachable on the workspace Information page. */
export function branchSummary(branch: BranchState): string {
  return branch.kind === "unavailable" ? "Branch unknown" : branchLabel(branch);
}
const separator = (path: string) => path.includes("\\") && !path.includes("/") ? "\\" : "/";
const tail = (path: string, count: number) => {
  const sep = separator(path), segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length <= count ? path : `…${sep}${segments.slice(-count).join(sep)}`;
};
/** Card path: unchanged when short, otherwise the last two segments after an
 * ellipsis. Callers keep the full path in a title and accessible name. */
export function compactPath(path: string, limit = 40): string {
  if (path.length <= limit) return path;
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length <= 1 ? path : tail(path, 2);
}
/** One dashboard render: colliding compact labels grow leading segments until
 * they differ, so equal display names stay told apart by their path. */
export function compactPaths(paths: readonly string[], limit = 40): string[] {
  const labels = paths.map(path => compactPath(path, limit));
  const depth = paths.map(() => 2);
  for (let round = 0; round < 64; round++) {
    // Decide every growth against this round's labels, not partially updated ones.
    const before = [...labels];
    let changed = false;
    before.forEach((label, index) => {
      if (label === paths[index]) return;
      const collides = paths.some((other, i) => i !== index && before[i] === label && other !== paths[index]);
      if (!collides) return;
      depth[index]!++; labels[index] = tail(paths[index]!, depth[index]!); changed = true;
    });
    if (!changed) break;
  }
  return labels;
}

/** Assignment facts only: neither presence nor a catalog name establishes readiness. */
export function workspaceAssignmentLabels(assignments: WorkspaceView["assignments"], catalog: PublicCredentialDto[] | "loading" | "unavailable"): string[] {
  const seen = new Set<string>();
  return assignments.flatMap(a => {
    const key = JSON.stringify([a.role, a.role === "authentication" ? a.host : null]);
    if (seen.has(key)) return [];
    seen.add(key);
    const name = Array.isArray(catalog) ? catalog.find(c => c.id === a.credentialId)?.name ?? `Missing credential (${a.credentialId})` : `${catalog === "loading" ? "Loading credential name" : "Credential name unavailable"} (${a.credentialId})`;
    return [`${a.role === "authentication" ? "AUTH" : "SIGNING"}: ${name}${a.role === "authentication" ? ` · ${a.host}` : ""}`];
  });
}
