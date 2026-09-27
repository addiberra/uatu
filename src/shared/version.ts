// node:fs and node:path resolve to empty stubs in the browser bundle; the
// reads below then fail into the same fallback a missing Git always had.
import { readFileSync } from "node:fs";
import path from "node:path";

import { version as packageJsonVersion } from "../../package.json";

export type BuildInfo = {
  version: string;
  branch: string;
  commitSha: string;
  commitShort: string;
  buildTime: string;
  release: boolean;
};

declare const __UATU_BUILD__: BuildInfo | undefined;

const INJECTED_BUILD: BuildInfo | undefined =
  typeof __UATU_BUILD__ === "undefined" ? undefined : __UATU_BUILD__;

// Single source of truth for the version is package.json — the release
// workflow's tag guard checks package.json, so deriving from it here keeps
// the embedded version incapable of drifting from the released tag.
export const PACKAGE_VERSION: string = packageJsonVersion;

// Hand-bumped integer marking contract breaks between the workspace server
// and the web assets bundled with the same product build. This is only part
// of the stale-web-client handshake; external clients use the independent
// public API revisions below.
export const BUNDLED_WEB_REVISION = 1;

// Public wire-contract compatibility identities. Breaking changes increment
// only the affected domain; product and bundled-web changes do not.
export const HUB_API_REVISION = 10;
export const WORKSPACE_API_REVISION = 21;

function runGit(args: string[]): string | null {
  try {
    const result = Bun.spawnSync({
      cmd: ["git", ...args],
      stdout: "pipe",
      stderr: "ignore",
    });

    if (result.exitCode !== 0) {
      return null;
    }

    const output = result.stdout.toString().trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

// Resolves what `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD`
// print, from the repository files alone: HEAD, loose refs, packed-refs, and
// a linked worktree's or submodule's `.git` file. Returns null for anything
// it does not model (an environment-directed repository, an unborn branch, a
// symbolic ref outside refs/heads, a reftable store), and the caller asks
// Git. Every module importing this one evaluates BUILD at load, so on the
// common path this spares two synchronous Git processes per process start —
// which also keeps test workers out of Bun.spawnSync, where Bun 1.4 can lose
// a child's exit and spin forever (oven-sh/bun#34069).
export function readGitHeadFromFiles(
  start: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): { branch: string; commitSha: string } | null {
  if (env.GIT_DIR || env.GIT_COMMON_DIR || env.GIT_WORK_TREE) return null;
  let gitDir: string | null = null;
  for (let directory = path.resolve(start); ; directory = path.dirname(directory)) {
    const dotGit = path.join(directory, ".git");
    const pointer = readText(dotGit);
    if (pointer !== null) {
      const match = /^gitdir: (.+)$/m.exec(pointer);
      if (!match) return null;
      gitDir = path.resolve(directory, match[1]!.trim());
      break;
    }
    if (readText(path.join(dotGit, "HEAD")) !== null) {
      gitDir = dotGit;
      break;
    }
    if (path.dirname(directory) === directory) return null;
  }
  const commonPointer = readText(path.join(gitDir, "commondir"));
  const commonDir = commonPointer === null ? gitDir : path.resolve(gitDir, commonPointer.trim());
  const head = readText(path.join(gitDir, "HEAD"))?.trim();
  if (!head) return null;
  if (OBJECT_ID.test(head)) return { branch: "HEAD", commitSha: head };
  const symbolic = /^ref: (refs\/heads\/.+)$/.exec(head);
  if (!symbolic) return null;
  const ref = symbolic[1]!;
  let commitSha: string | null = null;
  for (const directory of [gitDir, commonDir]) {
    const loose = readText(path.join(directory, ref))?.trim();
    if (loose && OBJECT_ID.test(loose)) {
      commitSha = loose;
      break;
    }
  }
  if (commitSha === null) {
    for (const line of (readText(path.join(commonDir, "packed-refs")) ?? "").split("\n")) {
      const [id, name] = line.trim().split(" ");
      if (name === ref && id && OBJECT_ID.test(id)) {
        commitSha = id;
        break;
      }
    }
  }
  if (commitSha === null) return null;
  return { branch: ref.slice("refs/heads/".length), commitSha };
}

export function readGitBuildInfo(version: string = PACKAGE_VERSION): BuildInfo {
  let fromFiles: ReturnType<typeof readGitHeadFromFiles> = null;
  try {
    fromFiles = readGitHeadFromFiles();
  } catch {
    // No filesystem (the browser bundle) or an unreadable tree: ask Git.
  }
  const branch = fromFiles?.branch ?? runGit(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "main";
  const commitSha = fromFiles?.commitSha ?? runGit(["rev-parse", "HEAD"]) ?? "unknown";
  const commitShort = commitSha === "unknown" ? "unknown" : commitSha.slice(0, 7);

  return {
    version,
    branch,
    commitSha,
    commitShort,
    buildTime: new Date().toISOString(),
    release: false,
  };
}

export const BUILD: BuildInfo = INJECTED_BUILD ?? readGitBuildInfo();

export const VERSION = BUILD.version;

export function formatBuildIdentifier(build: BuildInfo): string {
  if (build.release) {
    return `v${build.version} · ${build.commitShort}`;
  }

  if (build.commitSha === "unknown") {
    return `${build.branch}@unknown`;
  }

  return `${build.branch}@${build.commitShort}`;
}
