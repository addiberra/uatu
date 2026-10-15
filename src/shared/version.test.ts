import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BUNDLED_WEB_REVISION,
  formatBuildIdentifier,
  HUB_API_REVISION,
  readGitHeadFromFiles,
  type BuildInfo,
  WORKSPACE_API_REVISION,
} from "./version";

function makeBuild(overrides: Partial<BuildInfo>): BuildInfo {
  return {
    version: "0.1.0",
    branch: "main",
    commitSha: "6fa9c10abcdef",
    commitShort: "6fa9c10",
    buildTime: "2026-04-22T00:00:00Z",
    release: false,
    ...overrides,
  };
}

describe("formatBuildIdentifier", () => {
  test("release build shows version and short sha", () => {
    const build = makeBuild({ release: true });
    expect(formatBuildIdentifier(build)).toBe("v0.1.0 · 6fa9c10");
  });

  test("dev build shows branch and short sha", () => {
    const build = makeBuild({ branch: "main" });
    expect(formatBuildIdentifier(build)).toBe("main@6fa9c10");
  });

  test("dev build without git falls back to branch@unknown", () => {
    const build = makeBuild({ commitSha: "unknown", commitShort: "unknown" });
    expect(formatBuildIdentifier(build)).toBe("main@unknown");
  });
});

describe("compatibility revisions", () => {
  test("bundled-web, Hub, and workspace compatibility are integer constants", () => {
    expect(Number.isInteger(BUNDLED_WEB_REVISION)).toBe(true);
    expect(Number.isInteger(HUB_API_REVISION)).toBe(true);
    expect(Number.isInteger(WORKSPACE_API_REVISION)).toBe(true);
  });
});

describe("readGitHeadFromFiles", () => {
  const directories: string[] = [];
  afterAll(async () => {
    await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })));
  });

  // A tool environment built from scratch: nothing from a Hub-managed
  // workspace (projected config, signing, a wrapper's HOME) reaches Git.
  const gitEnv = (home: string): Record<string, string> => ({
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  });
  // Asynchronous on purpose: Bun.spawnSync can lose a child's exit
  // (oven-sh/bun#34069), which is what the function under test avoids.
  const spawnGit = async (
    cwd: string,
    env: Record<string, string>,
    args: string[],
  ): Promise<{ out: string; err: string; code: number }> => {
    const child = Bun.spawn(["git", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
      cwd, env, stdout: "pipe", stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out: out.trim(), err, code };
  };
  const git = async (cwd: string, home: string, ...args: string[]): Promise<string> => {
    const { out, err, code } = await spawnGit(cwd, gitEnv(home), args);
    if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${err}`);
    return out;
  };
  const temporary = async (): Promise<string> => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "uatu-version-")));
    directories.push(root);
    await mkdir(path.join(root, "home"));
    return root;
  };
  const repository = async (): Promise<{ root: string; home: string; repo: string }> => {
    const root = await temporary();
    const home = path.join(root, "home");
    const repo = path.join(root, "repo");
    await mkdir(repo);
    await git(repo, home, "init", "-q");
    await git(repo, home, "commit", "-q", "--allow-empty", "-m", "first");
    return { root, home, repo };
  };
  const revParse = async (cwd: string, home: string) => ({
    branch: await git(cwd, home, "rev-parse", "--abbrev-ref", "HEAD"),
    commitSha: await git(cwd, home, "rev-parse", "HEAD"),
  });

  test("a branch with a loose ref, read from a subdirectory, matches git rev-parse", async () => {
    const { home, repo } = await repository();
    await git(repo, home, "checkout", "-q", "-b", "feature/nested");
    const nested = path.join(repo, "a", "b");
    await mkdir(nested, { recursive: true });
    expect(readGitHeadFromFiles(nested, {})).toEqual(await revParse(repo, home));
    expect(readGitHeadFromFiles(nested, {})?.branch).toBe("feature/nested");
  });

  test("a packed ref and a detached HEAD match git rev-parse", async () => {
    const { home, repo } = await repository();
    await git(repo, home, "pack-refs", "--all");
    expect(await Bun.file(path.join(repo, ".git", "refs", "heads", "main")).exists()).toBe(false);
    expect(readGitHeadFromFiles(repo, {})).toEqual(await revParse(repo, home));
    await git(repo, home, "checkout", "-q", "--detach");
    expect(readGitHeadFromFiles(repo, {})).toEqual(await revParse(repo, home));
    expect(readGitHeadFromFiles(repo, {})?.branch).toBe("HEAD");
  });

  test("a linked worktree resolves through its .git file and the common directory", async () => {
    const { root, home, repo } = await repository();
    const linked = path.join(root, "linked");
    await git(repo, home, "worktree", "add", "-q", "-b", "side", linked);
    await git(linked, home, "commit", "-q", "--allow-empty", "-m", "on side");
    expect(readGitHeadFromFiles(linked, {})).toEqual(await revParse(linked, home));
    expect(readGitHeadFromFiles(linked, {})?.branch).toBe("side");
  });

  test("defers to Git for an unborn branch, an environment-directed repository, or no repository", async () => {
    const unborn = await temporary();
    await git(unborn, path.join(unborn, "home"), "init", "-q");
    expect(readGitHeadFromFiles(unborn, {})).toBeNull();
    const { repo } = await repository();
    expect(readGitHeadFromFiles(repo, { GIT_DIR: path.join(repo, ".git") })).toBeNull();
    expect(readGitHeadFromFiles(await temporary(), {})).toBeNull();
  });

  test("stops at GIT_CEILING_DIRECTORIES where git rev-parse does", async () => {
    const { root, home, repo } = await repository();
    const nested = path.join(repo, "a", "b");
    await mkdir(nested, { recursive: true });
    const found = await revParse(repo, home);
    const gitRefuses = async (cwd: string, ceilings: string): Promise<boolean> =>
      (await spawnGit(cwd, { ...gitEnv(home), GIT_CEILING_DIRECTORIES: ceilings }, ["rev-parse", "HEAD"]))
        .code !== 0;

    // A ceiling above the repository leaves discovery alone.
    expect(await gitRefuses(nested, root)).toBe(false);
    expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: root })).toEqual(found);

    // A ceiling at the repository root: the walk does not ascend into it...
    expect(await gitRefuses(nested, repo)).toBe(true);
    expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: repo })).toBeNull();
    // ...nor past a nearer ceiling in a list (unresolvable and relative entries are dropped)...
    const list = ["/nonexistent-uatu-ceiling", path.join(repo, "a"), "relative/ignored"].join(path.delimiter);
    expect(await gitRefuses(nested, list)).toBe(true);
    expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: list })).toBeNull();
    // ...but the starting directory is searched even when it is a ceiling.
    expect(await gitRefuses(repo, repo)).toBe(false);
    expect(readGitHeadFromFiles(repo, { GIT_CEILING_DIRECTORIES: repo })).toEqual(found);

    // Entries after an empty one are taken as written, not symlink-resolved.
    const alias = path.join(root, "alias");
    await symlink(repo, alias);
    expect(await gitRefuses(nested, alias)).toBe(true);
    expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: alias })).toBeNull();
    const unresolved = `${path.delimiter}${alias}`;
    expect(await gitRefuses(nested, unresolved)).toBe(false);
    expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: unresolved })).toEqual(found);
  });

  test("reads the ceiling from the env parameter, not process.env", async () => {
    const { home, repo } = await repository();
    const nested = path.join(repo, "a");
    await mkdir(nested);
    const saved = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = repo;
    try {
      expect(readGitHeadFromFiles(nested, {})).toEqual(await revParse(repo, home));
      expect(readGitHeadFromFiles(nested, { GIT_CEILING_DIRECTORIES: repo })).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = saved;
    }
  });
});
