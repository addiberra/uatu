// Guarded worktree removal: the read-only safety inspection and the single
// Git mutation (tasks 5.3–5.4). Orchestration — ownership, fences,
// stopping, journaling, Hub cleanup — lives in worktree-service.ts; this
// module answers "may these files be removed right now, and what local data
// would go with them" and runs `git worktree remove`, forced at most once.
//
// What blocks, and why each is a blocker rather than a warning — none of
// these can be acknowledged away:
//   * `git worktree lock` — an explicit "do not remove" from someone.
//   * a linked worktree nested inside — removing the parent directory would
//     remove another checkout's files with it.
//   * a Git operation in progress or paused — somebody outside Uatu is
//     working in that tree right now; Uatu cannot stop them and says so.
//   * an initialized submodule or a nested Git repository — its own history
//     and local data would be deleted with the tree. Non-force Git refuses
//     populated submodules itself, but a single `--force` skips that check,
//     and a repository nested inside a tracked directory is deleted even
//     without force, so Uatu checks first.
//   * an unreadable status or index, or a path that did not decode as
//     UTF-8 — fails closed.
//
// What is DESCRIBED rather than blocked here: acknowledgeable local data —
// tracked changes (staged or unstaged), untracked files and IGNORED files.
// `git worktree remove` deletes ignored files silently, and Uatu cannot tell
// build output from a `.env`, a database or a signing key; nothing is
// copied, so nothing is recoverable. Each category is disclosed with a
// count, a short sample and one fingerprint of the complete status set, and
// `checkLocalDataAcknowledgement` refuses removal unless the caller echoed
// that exact fingerprint back.
//
// The branch is never touched: there is no branch argument anywhere here.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { WorktreeOperationError, type WorktreeLocalData, type WorktreeLocalDataCategory } from "../shared/worktree-contract";
import { assertGitArgumentSafe, type GitRunner, type WorktreeRecord } from "./worktree-git";

export type RemovalDataSummary = { tracked: number; untracked: number; ignored: number };

export const LOCAL_DATA_CATEGORIES = ["tracked", "untracked", "ignored"] as const;
export type LocalDataCategoryName = (typeof LOCAL_DATA_CATEGORIES)[number];

// One `git status --porcelain=v1 -z` entry: its two-letter status code and
// its checkout-relative path (a directory keeps Git's trailing `/`).
export type PorcelainEntry = { readonly code: string; readonly path: string };
export type CategorizedStatus = Record<LocalDataCategoryName, PorcelainEntry[]>;

function categoryOf(code: string): LocalDataCategoryName {
  return code === "??" ? "untracked" : code === "!!" ? "ignored" : "tracked";
}

// `git status --porcelain=v1 -z`: `XY <path>` entries, NUL-separated; a
// rename/copy entry is followed by its source path as a separate field,
// which is skipped (`--no-renames` should prevent it; this stays for safety).
export function categorizePorcelainStatus(output: string): CategorizedStatus {
  const status: CategorizedStatus = { tracked: [], untracked: [], ignored: [] };
  const fields = output.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.length < 3) continue;
    const code = field.slice(0, 2);
    const category = categoryOf(code);
    status[category].push({ code, path: field.slice(3) });
    if (category === "tracked" && (code.includes("R") || code.includes("C"))) index += 1;
  }
  return status;
}

export function summarizePorcelainStatus(output: string): RemovalDataSummary {
  const status = categorizePorcelainStatus(output);
  return { tracked: status.tracked.length, untracked: status.untracked.length, ignored: status.ignored.length };
}

export const LOCAL_DATA_SAMPLE_SIZE = 5;
const FINGERPRINT_DOMAIN = "uatu-worktree-local-data-v1";

// The server-side description: the wire categories plus every sorted entry
// path, which never leaves the Hub.
export type LocalDataCategoryDescription = WorktreeLocalDataCategory & { readonly entries: readonly string[] };
export type LocalDataDescription = {
  readonly tracked?: LocalDataCategoryDescription;
  readonly untracked?: LocalDataCategoryDescription;
  readonly ignored?: LocalDataCategoryDescription;
  readonly fingerprint: string;
};

// Plain code-unit order: deterministic across locales and runtimes.
function byCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// SHA-256 over the domain tag, the checkout id and every entry's `XY` NUL
// `path` NUL, sorted by path. The checkout id keeps one tree's fingerprint
// from ever matching another; the status code makes staging, deleting or
// re-creating a reviewed path a different set.
export function localDataFingerprint(checkoutId: string, entries: readonly PorcelainEntry[]): string {
  const hash = createHash("sha256");
  hash.update(`${FINGERPRINT_DOMAIN}\0${checkoutId}\0`, "utf8");
  for (const entry of [...entries].sort((left, right) => byCodeUnits(left.path, right.path))) {
    hash.update(`${entry.code}\0${entry.path}\0`, "utf8");
  }
  return hash.digest("hex");
}

// Undefined when the checkout has no local data at all.
export function describeLocalData(checkoutId: string, status: CategorizedStatus): LocalDataDescription | undefined {
  const all = LOCAL_DATA_CATEGORIES.flatMap(category => status[category]);
  if (all.length === 0) return undefined;
  const categories: Partial<Record<LocalDataCategoryName, LocalDataCategoryDescription>> = {};
  for (const category of LOCAL_DATA_CATEGORIES) {
    const entries = status[category].map(entry => entry.path).sort(byCodeUnits);
    if (entries.length === 0) continue;
    categories[category] = { count: entries.length, sample: entries.slice(0, LOCAL_DATA_SAMPLE_SIZE), entries };
  }
  return { ...categories, fingerprint: localDataFingerprint(checkoutId, all) };
}

// The published shape: counts, bounded samples and the fingerprint only.
export function toWireLocalData(description: LocalDataDescription): WorktreeLocalData {
  const wire: { tracked?: WorktreeLocalDataCategory; untracked?: WorktreeLocalDataCategory; ignored?: WorktreeLocalDataCategory } = {};
  for (const category of LOCAL_DATA_CATEGORIES) {
    const described = description[category];
    if (described) wire[category] = { count: described.count, sample: [...described.sample] };
  }
  return { ...wire, fingerprint: description.fingerprint };
}

function blocker(code: Parameters<typeof WorktreeOperationError.of>[0], message: string, retry: "retry-delete" | "none" | "refresh" = "retry-delete"): WorktreeOperationError {
  return WorktreeOperationError.of(code, message, { retry, phase: "preflight" });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    // An unreadable location is not proof of absence.
    return true;
  }
}

function inside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function nestedRepository(relative: string): WorktreeOperationError {
  const shown = relative.replace(/\/+$/, "");
  return blocker("nested-dependency", `This worktree contains a submodule or another Git repository (${shown}). Remove or move it outside Uatu first. Nothing was removed.`);
}

const UNINSPECTABLE = "The worktree's files could not be inspected, so it was not removed.";

// The index listing is the one probe whose output grows with the repository
// (about 90 bytes per tracked file), so it gets its own, larger bound —
// roughly 700k tracked files — and still fails closed beyond it.
export const INDEX_OUTPUT_LIMIT = 64 * 1024 * 1024;

// Probe output is decoded leniently, so bytes that are not UTF-8 arrive as
// U+FFFD. Such a path cannot be checked on disk (the lookup would miss the
// real name) and two such names could share a fingerprint: fail closed.
function undecodable(relative: string): boolean {
  return relative.includes("\uFFFD");
}

// Every ancestor directory of a checkout-relative path, excluding the root.
function addAncestors(relative: string, into: Set<string>): void {
  const parts = relative.replace(/\/+$/, "").split("/");
  for (let depth = 1; depth < parts.length; depth += 1) into.add(parts.slice(0, depth).join("/"));
}

// The first candidate (in order) whose `<candidate>/.git` exists, checked in
// small concurrent batches so a large index stays quick. `exists` fails
// closed: an unreadable location counts as present.
async function firstNestedRepository(checkoutPath: string, candidates: readonly string[]): Promise<string | undefined> {
  const BATCH = 64;
  for (let start = 0; start < candidates.length; start += BATCH) {
    const batch = candidates.slice(start, start + BATCH);
    const found = await Promise.all(batch.map(candidate => exists(path.join(checkoutPath, candidate, ".git"))));
    const index = found.indexOf(true);
    if (index >= 0) return batch[index];
  }
  return undefined;
}

export type RemovalSafetyInput = {
  run: GitRunner;
  checkoutPath: string;
  // The checkout identity the fingerprint is bound to.
  checkoutId: string;
  // The repository's current `git worktree list`, read under the fence.
  records: readonly WorktreeRecord[];
};

export type RemovalSafety =
  | { readonly blocked: WorktreeOperationError }
  | { readonly clear: true; readonly localData?: LocalDataDescription };

// Returns the ONE blocker that stops removal, or a clear result that
// describes any local data removal would discard. Read-only.
export async function inspectRemovalSafety(input: RemovalSafetyInput): Promise<RemovalSafety> {
  const { run, checkoutPath, checkoutId, records } = input;
  const record = records.find(candidate => candidate.path === checkoutPath);
  if (!record) {
    return { blocked: blocker("identity-uncertain", "Git no longer lists this worktree. Refresh the inventory; nothing was removed.", "refresh") };
  }
  if (record.locked) {
    return { blocked: blocker("git-lock", "This worktree is locked in Git. Unlock it outside Uatu if it is safe, then retry. Nothing was removed.") };
  }
  const nested = records.find(candidate => inside(checkoutPath, candidate.path));
  if (nested) {
    return { blocked: blocker("nested-dependency", "Another worktree is inside this folder. Remove or move it first; nothing was removed.") };
  }

  // Resolve through Git: linked checkouts have their own operation state
  // and their own submodule store, while some paths can be relocated by
  // repository configuration.
  const markers = ["index.lock", "rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "sequencer", "BISECT_START"];
  const gitPaths = [...markers, "modules"];
  const resolved = await run(["rev-parse", "--path-format=absolute", ...gitPaths.flatMap(marker => ["--git-path", marker])], checkoutPath);
  const resolvedPaths = resolved.stdout.trimEnd().split("\n");
  if (resolved.exitCode !== 0 || resolved.timedOut || resolved.outputExceeded || resolvedPaths.length !== gitPaths.length || resolvedPaths.some(candidate => !path.isAbsolute(candidate))) {
    return { blocked: blocker("identity-uncertain", "The worktree could not be inspected, so it was not removed.") };
  }
  for (const marker of resolvedPaths.slice(0, markers.length)) {
    if (await exists(marker)) {
      return { blocked: blocker("external-activity", "A Git operation appears to be running or paused in this worktree outside Uatu. Finish or abort it, then retry. Nothing was removed.") };
    }
  }
  // This tree's own submodule repositories (`<gitdir>/worktrees/<id>/modules`),
  // which a forced removal would delete with it. Git applies the same test
  // before a non-force removal.
  if (await exists(resolvedPaths[markers.length]!)) {
    return { blocked: blocker("nested-dependency", "This worktree contains an initialized submodule. Remove or move it outside Uatu first. Nothing was removed.") };
  }

  const statusRun = await run(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching", "--no-renames"], checkoutPath);
  if (statusRun.exitCode !== 0 || statusRun.timedOut || statusRun.outputExceeded) {
    return { blocked: blocker("identity-uncertain", UNINSPECTABLE) };
  }
  const status = categorizePorcelainStatus(statusRun.stdout);
  const entries = [...status.tracked, ...status.untracked, ...status.ignored];
  if (entries.some(entry => undecodable(entry.path))) return { blocked: blocker("identity-uncertain", UNINSPECTABLE) };

  // A directory entry is where Git stopped descending. Under
  // `--untracked-files=all` an untracked one is always a nested repository;
  // an ignored one is checked at its root only (walking it is unbounded).
  for (const entry of [...status.untracked, ...status.ignored]) {
    if (entry.path.endsWith("/") && await exists(path.join(checkoutPath, entry.path, ".git"))) {
      return { blocked: nestedRepository(entry.path) };
    }
  }

  // The index covers what status cannot show. Git lists tracked files even
  // inside a directory that has since become a repository of its own, and a
  // clean status says nothing about it — yet `git worktree remove` deletes
  // that repository with or without force. So, on every inspection:
  //   * populated gitlinks (mode 160000 with `<path>/.git`) — Git's own
  //     `validate_no_submodules`, which a single force skips, and which also
  //     catches embedded repositories added without a `.gitmodules` entry;
  //   * a `.git` in any ancestor directory of a tracked path or of a status
  //     entry — a repository nested inside tracked content.
  const index = await run(["ls-files", "-z", "--stage"], checkoutPath, { outputLimit: INDEX_OUTPUT_LIMIT });
  if (index.exitCode !== 0 || index.timedOut || index.outputExceeded) {
    return { blocked: blocker("identity-uncertain", UNINSPECTABLE) };
  }
  const gitlinks: string[] = [];
  const directories = new Set<string>();
  for (const record of index.stdout.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    if (tab < 0) return { blocked: blocker("identity-uncertain", UNINSPECTABLE) };
    const relative = record.slice(tab + 1);
    if (relative === "" || undecodable(relative)) return { blocked: blocker("identity-uncertain", UNINSPECTABLE) };
    if (record.startsWith("160000 ")) gitlinks.push(relative);
    addAncestors(relative, directories);
  }
  for (const entry of entries) addAncestors(entry.path, directories);
  const nestedGitlink = await firstNestedRepository(checkoutPath, gitlinks);
  if (nestedGitlink !== undefined) return { blocked: nestedRepository(nestedGitlink) };
  const nestedDirectory = await firstNestedRepository(checkoutPath, [...directories].sort(byCodeUnits));
  if (nestedDirectory !== undefined) return { blocked: nestedRepository(nestedDirectory) };

  const localData = describeLocalData(checkoutId, status);
  return localData ? { clear: true, localData } : { clear: true };
}

// Whether the described local data is acknowledged by `fingerprint`.
// Undefined means removal may proceed past local data: there is none, or
// the caller acknowledged exactly this set. Otherwise the `local-data`
// refusal names the first category present, or says the set changed.
export function checkLocalDataAcknowledgement(localData: LocalDataDescription | WorktreeLocalData | undefined, fingerprint?: string): WorktreeOperationError | undefined {
  if (!localData) return undefined;
  if (fingerprint === undefined) {
    const { tracked, untracked, ignored } = localData;
    if (tracked) {
      return blocker("local-data", `It has uncommitted changes (${plural(tracked.count, "file", "files")}). Commit, stash or discard them, or confirm deleting them with the worktree. Nothing was removed.`);
    }
    if (untracked) {
      return blocker("local-data", `It has untracked files (${plural(untracked.count, "file", "files")}). Commit, move or delete them, or confirm deleting them with the worktree. Nothing was removed.`);
    }
    const count = ignored?.count ?? 0;
    return blocker("local-data", `It has ignored files (${plural(count, "file", "files")}), such as build output or local settings, that would be lost. Move or delete them, or confirm deleting them with the worktree. Nothing was removed.`);
  }
  if (fingerprint !== localData.fingerprint) {
    return blocker("local-data", "The worktree's files changed while deletion was prepared. Review the deletion again. Nothing was removed.");
  }
  return undefined;
}

// Git refuses a non-force removal of tracked changes or untracked files;
// ignored files it deletes without force. So force is needed exactly when
// the (already acknowledged) data has tracked or untracked entries.
export function removalRequiresForce(localData: LocalDataDescription | WorktreeLocalData | undefined): boolean {
  return localData !== undefined && (localData.tracked !== undefined || localData.untracked !== undefined);
}

// The only two argument shapes this module may ever pass. A single
// `--force` never overrides a Git lock (that takes `-f -f`), and no input
// can produce a second one.
export function buildWorktreeRemoveArguments(checkoutPath: string, options: { readonly force: boolean }): string[] {
  if (!path.isAbsolute(checkoutPath)) throw WorktreeOperationError.of("invalid-input", "the checkout path must be absolute");
  assertGitArgumentSafe(checkoutPath, "checkout path");
  const args = options.force
    ? ["worktree", "remove", "--force", "--", checkoutPath]
    : ["worktree", "remove", "--", checkoutPath];
  if (countForceArguments(args) !== (options.force ? 1 : 0)) throw WorktreeOperationError.of("internal", "an unexpected forced removal was requested");
  return args;
}

// How many forces Git would see before the `--` separator: `--force` counts
// once, and a short-option cluster counts each `f` (`-ff` is two).
export function countForceArguments(args: readonly string[]): number {
  const separator = args.indexOf("--");
  const options = separator < 0 ? args : args.slice(0, separator);
  let forces = 0;
  for (const arg of options) {
    if (arg === "--force") forces += 1;
    else if (/^-[^-]/.test(arg)) forces += [...arg.slice(1)].filter(letter => letter === "f").length;
  }
  return forces;
}

export function classifyWorktreeRemoveFailure(stderr: string): WorktreeOperationError {
  const text = stderr.toLowerCase();
  if (/modified or untracked files|contains modified|untracked/.test(text)) {
    return WorktreeOperationError.of("local-data", "Git found local changes and did not remove the worktree. Nothing was removed.", { retry: "retry-delete", phase: "removing" });
  }
  if (/locked/.test(text)) {
    return WorktreeOperationError.of("git-lock", "The worktree is locked in Git. Nothing was removed.", { retry: "retry-delete", phase: "removing" });
  }
  if (/submodule/.test(text)) {
    return WorktreeOperationError.of("nested-dependency", "The worktree contains submodules Git will not remove without force. Nothing was removed.", { retry: "none", phase: "removing" });
  }
  if (/main working tree/.test(text)) {
    return WorktreeOperationError.of("ownership-required", "The main checkout cannot be deleted.", { retry: "none", phase: "removing" });
  }
  return WorktreeOperationError.of("conflict", `Git did not remove the worktree: ${stderr}`, { retry: "retry-delete", phase: "removing" });
}

export type WorktreeRemoveOutcome = { readonly ok: true } | { readonly ok: false; readonly error: WorktreeOperationError };

export async function runWorktreeRemove(run: GitRunner, mainPath: string, checkoutPath: string, options: { readonly force: boolean }): Promise<WorktreeRemoveOutcome> {
  const result = await run(buildWorktreeRemoveArguments(checkoutPath, options), mainPath);
  if (result.exitCode === 0 && !result.timedOut) return { ok: true };
  if (result.timedOut) {
    return { ok: false, error: WorktreeOperationError.of("timeout", "Removing the worktree timed out. Refresh the inventory before retrying.", { retry: "refresh", phase: "removing" }) };
  }
  return { ok: false, error: classifyWorktreeRemoveFailure(result.stderr || result.stdout) };
}
