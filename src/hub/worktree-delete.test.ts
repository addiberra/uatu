import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGitRunner, listWorktrees } from "./worktree-git";
import { inspectRemovalSafety } from "./worktree-delete";

test.each(["index.lock", "rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "sequencer", "BISECT_START"])("operation marker %s blocks an otherwise clean checkout", async marker => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uatu-delete-marker-"));
  try {
    if (["rebase-merge", "rebase-apply", "sequencer"].includes(marker)) await mkdir(path.join(root, marker));
    else await writeFile(path.join(root, marker), "state");
    const result = await inspectRemovalSafety({
      checkoutPath: root,
      checkoutId: "checkout-marker",
      records: [{ path: root, head: "abc", branch: "topic", bare: false, detached: false, locked: false, lockReason: null, prunable: false }],
      run: async args => ({ exitCode: 0, stdout: args[0] === "rev-parse" ? args.flatMap((arg, index) => arg === "--git-path" ? [path.join(root, args[index + 1]!)] : []).join("\n") + "\n" : "", stderr: "", timedOut: false, outputExceeded: false }),
    });
    expect("blocked" in result && result.blocked.detail.code).toBe("external-activity");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a clean linked checkout paused at an interactive rebase edit cannot be removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uatu-delete-rebase-"));
  const env = { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test", GIT_SEQUENCE_EDITOR: "sed -i.bak s/pick/edit/g" };
  const run = createGitRunner({ env });
  const git = async (args: string[], cwd = root) => {
    const result = await run(args, cwd);
    expect(result.exitCode).toBe(0);
    return result.stdout;
  };
  try {
    await git(["init", "--initial-branch=main"]);
    await git(["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "initial"]);
    const checkout = path.join(root, "linked");
    await git(["worktree", "add", "-b", "topic", checkout]);
    await git(["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "topic"], checkout);
    await git(["rebase", "-i", "HEAD~1"], checkout);
    expect(await git(["status", "--porcelain"], checkout)).toBe("");
    const inventory = await listWorktrees(root, { env });
    if (inventory.kind !== "inventory") throw new Error("missing inventory");
    const canonical = (await git(["rev-parse", "--show-toplevel"], checkout)).trim();
    const result = await inspectRemovalSafety({ run, checkoutPath: canonical, checkoutId: "checkout-rebase", records: inventory.records });
    expect("blocked" in result && result.blocked.detail.code).toBe("external-activity");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import { buildWorktreeRemoveArguments, categorizePorcelainStatus, checkLocalDataAcknowledgement, classifyWorktreeRemoveFailure, countForceArguments, describeLocalData, INDEX_OUTPUT_LIMIT, localDataFingerprint, removalRequiresForce, summarizePorcelainStatus } from "./worktree-delete";

describe("status summary", () => {
  test("counts tracked, untracked and ignored entries, skipping rename sources", () => {
    const output = [" M README.md", "R  new.md", "old.md", "?? scratch.txt", "!! .env.local", "!! build/", ""].join("\0");
    expect(summarizePorcelainStatus(output)).toEqual({ tracked: 2, untracked: 1, ignored: 2 });
    expect(summarizePorcelainStatus("")).toEqual({ tracked: 0, untracked: 0, ignored: 0 });
  });
});

describe("removal arguments", () => {
  const forces = countForceArguments;

  test("force counting sees every force Git would see, including combined short flags", () => {
    expect(countForceArguments(["worktree", "remove", "--", "/a"])).toBe(0);
    expect(countForceArguments(["worktree", "remove", "--force", "--", "/a"])).toBe(1);
    expect(countForceArguments(["worktree", "remove", "-f", "--", "/a"])).toBe(1);
    expect(countForceArguments(["worktree", "remove", "-ff", "--", "/a"])).toBe(2);
    expect(countForceArguments(["worktree", "remove", "-f", "-f", "--", "/a"])).toBe(2);
    expect(countForceArguments(["worktree", "remove", "--force", "--force", "--", "/a"])).toBe(2);
    expect(countForceArguments(["worktree", "remove", "-qf", "--force", "--", "/a"])).toBe(2);
    // After the separator a path is a path, whatever it looks like.
    expect(countForceArguments(["worktree", "remove", "--", "-ff"])).toBe(0);
  });

  test("the non-force shape is unchanged: separator-guarded and absolute-only", () => {
    expect(buildWorktreeRemoveArguments("/repos/atlas.worktrees/feature-x", { force: false })).toEqual(["worktree", "remove", "--", "/repos/atlas.worktrees/feature-x"]);
    expect(() => buildWorktreeRemoveArguments("relative/path", { force: false })).toThrow();
    expect(() => buildWorktreeRemoveArguments("-f", { force: false })).toThrow();
    expect(() => buildWorktreeRemoveArguments("-f", { force: true })).toThrow();
    expect(() => buildWorktreeRemoveArguments("--force", { force: true })).toThrow();
    expect(() => buildWorktreeRemoveArguments("relative/path", { force: true })).toThrow();
    expect(forces(buildWorktreeRemoveArguments("/a", { force: false }))).toBe(0);
  });

  test("the force shape has exactly one --force, before the separator", () => {
    const args = buildWorktreeRemoveArguments("/repos/atlas.worktrees/feature-x", { force: true });
    expect(args).toEqual(["worktree", "remove", "--force", "--", "/repos/atlas.worktrees/feature-x"]);
    expect(forces(args)).toBe(1);
    expect(args.indexOf("--force")).toBeLessThan(args.indexOf("--"));
  });

  test("no input yields two force arguments", () => {
    for (const force of [true, false]) {
      for (const candidate of ["/a", "/a/--force", "/a/-f", "/-f -f", "/a b/-ff"]) {
        const args = buildWorktreeRemoveArguments(candidate, { force });
        const beforeSeparator = args.slice(0, args.indexOf("--"));
        expect(beforeSeparator.filter(argument => argument.startsWith("-")).length).toBe(force ? 1 : 0);
        expect(countForceArguments(args)).toBe(force ? 1 : 0);
        expect(args.at(-1)).toBe(candidate);
      }
    }
  });

  test("force is needed only for tracked or untracked data", () => {
    const category = { count: 1, sample: ["x"] };
    const fingerprint = "f".repeat(64);
    expect(removalRequiresForce(undefined)).toBe(false);
    expect(removalRequiresForce({ ignored: category, fingerprint })).toBe(false);
    expect(removalRequiresForce({ tracked: category, fingerprint })).toBe(true);
    expect(removalRequiresForce({ untracked: category, fingerprint })).toBe(true);
    expect(removalRequiresForce({ tracked: category, untracked: category, ignored: category, fingerprint })).toBe(true);
  });

  test("Git refusals map to the closed vocabulary with no path leaked", () => {
    expect(classifyWorktreeRemoveFailure("fatal: '/secret/tree' contains modified or untracked files, use --force to delete it").detail.code).toBe("local-data");
    expect(classifyWorktreeRemoveFailure("fatal: cannot remove a locked working tree").detail.code).toBe("git-lock");
    expect(classifyWorktreeRemoveFailure("fatal: working trees containing submodules cannot be moved or removed").detail.code).toBe("nested-dependency");
    expect(classifyWorktreeRemoveFailure("fatal: '/secret' is a main working tree").detail.code).toBe("ownership-required");
    const other = classifyWorktreeRemoveFailure("fatal: something at /home/someone/tree went wrong").detail;
    expect(other.code).toBe("conflict");
    expect(other.message).not.toContain("/home/");
  });
});

describe("local-data description", () => {
  const status = (...entries: string[]) => categorizePorcelainStatus([...entries, ""].join("\0"));

  test("the fingerprint is deterministic and independent of entry order", () => {
    const one = describeLocalData("checkout-a", status(" M b.md", "?? a.txt", "!! .env", "!! build/"));
    const two = describeLocalData("checkout-a", status("!! build/", "!! .env", "?? a.txt", " M b.md"));
    expect(one?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(two?.fingerprint).toBe(one!.fingerprint);
    expect(localDataFingerprint("checkout-a", [{ code: " M", path: "b.md" }, { code: "??", path: "a.txt" }]))
      .toBe(localDataFingerprint("checkout-a", [{ code: "??", path: "a.txt" }, { code: " M", path: "b.md" }]));
  });

  test("a changed status code or an added entry changes the fingerprint", () => {
    const base = describeLocalData("checkout-a", status(" M README.md"))!.fingerprint;
    expect(describeLocalData("checkout-a", status("M  README.md"))!.fingerprint).not.toBe(base);
    expect(describeLocalData("checkout-a", status(" M README.md", "!! .env"))!.fingerprint).not.toBe(base);
    expect(describeLocalData("checkout-a", status(" D README.md"))!.fingerprint).not.toBe(base);
  });

  test("different checkout ids give different fingerprints", () => {
    expect(describeLocalData("checkout-a", status("!! .env"))!.fingerprint).not.toBe(describeLocalData("checkout-b", status("!! .env"))!.fingerprint);
  });

  test("a directory entry is counted once, and a clean tree has no description", () => {
    const description = describeLocalData("checkout-a", status("!! node_modules/", "!! .env"));
    expect(description?.ignored).toEqual({ count: 2, sample: [".env", "node_modules/"], entries: [".env", "node_modules/"] });
    expect(description?.tracked).toBeUndefined();
    expect(description?.untracked).toBeUndefined();
    expect(describeLocalData("checkout-a", status())).toBeUndefined();
  });

  test("samples are bounded to five and sorted by code units", () => {
    const description = describeLocalData("checkout-a", status("?? g", "?? b", "?? a", "?? f", "?? c", "?? e", "?? d", "?? B"))!;
    expect(description.untracked).toEqual({ count: 8, sample: ["B", "a", "b", "c", "d"], entries: ["B", "a", "b", "c", "d", "e", "f", "g"] });
  });

  test("rename sources are skipped when categorizing", () => {
    expect(categorizePorcelainStatus(["R  new.md", "old.md", "?? x", ""].join("\0"))).toEqual({
      tracked: [{ code: "R ", path: "new.md" }], untracked: [{ code: "??", path: "x" }], ignored: [],
    });
  });
});

describe("local-data acknowledgement", () => {
  const fingerprint = "0".repeat(64);
  const category = (count: number) => ({ count, sample: ["x"], entries: ["x"] });

  test("no local data passes whatever was sent", () => {
    expect(checkLocalDataAcknowledgement(undefined)).toBeUndefined();
    expect(checkLocalDataAcknowledgement(undefined, fingerprint)).toBeUndefined();
  });

  test("a matching fingerprint passes", () => {
    expect(checkLocalDataAcknowledgement({ tracked: category(1), fingerprint }, fingerprint)).toBeUndefined();
  });

  test.each([
    ["tracked", { tracked: category(3), untracked: category(1), ignored: category(1) }, "It has uncommitted changes (3 files). Commit, stash or discard them, or confirm deleting them with the worktree. Nothing was removed."],
    ["untracked", { untracked: category(1), ignored: category(2) }, "It has untracked files (1 file). Commit, move or delete them, or confirm deleting them with the worktree. Nothing was removed."],
    ["ignored", { ignored: category(2) }, "It has ignored files (2 files), such as build output or local settings, that would be lost. Move or delete them, or confirm deleting them with the worktree. Nothing was removed."],
  ])("unacknowledged %s data names the first category present", (_label, categories, message) => {
    const error = checkLocalDataAcknowledgement({ ...categories, fingerprint });
    expect(error?.detail).toMatchObject({ code: "local-data", retry: "retry-delete", message });
  });

  test("a different fingerprint says the files changed", () => {
    const error = checkLocalDataAcknowledgement({ ignored: category(1), fingerprint }, "1".repeat(64));
    expect(error?.detail).toMatchObject({ code: "local-data", retry: "retry-delete", message: "The worktree's files changed while deletion was prepared. Review the deletion again. Nothing was removed." });
  });
});

// Several Git processes per case (submodule add/update included): allow
// for a cold or loaded machine.
const REAL_GIT_TIMEOUT = 30_000;

describe("submodules and nested repositories (real Git)", () => {
  type Fixture = { root: string; main: string; checkout: string; run: ReturnType<typeof createGitRunner>; env: Record<string, string>; git: (args: string[], cwd?: string) => Promise<string> };
  const withRepository = async (body: (fixture: Fixture) => Promise<void>) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "uatu-delete-nested-"));
    const env = { PATH: "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };
    const run = createGitRunner({ env });
    const git = async (args: string[], cwd = root) => {
      const result = await run(["-c", "commit.gpgsign=false", "-c", "protocol.file.allow=always", ...args], cwd);
      if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
      return result.stdout;
    };
    try {
      const main = path.join(root, "main");
      await git(["init", "--initial-branch=main", main]);
      await writeFile(path.join(main, ".gitignore"), "ignored/\n.env\n");
      await writeFile(path.join(main, "README.md"), "readme\n");
      await git(["add", "."], main);
      await git(["commit", "-m", "initial"], main);
      await body({ root, main, checkout: "", run, env, git });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };
  const addLinked = async (fixture: Fixture, branch = "topic") => {
    const target = path.join(fixture.root, "linked");
    await fixture.git(["worktree", "add", "-b", branch, target], fixture.main);
    return (await fixture.git(["rev-parse", "--show-toplevel"], target)).trim();
  };
  const inspect = async (fixture: Fixture, checkout: string, recorded: string[][] = [], limits: Array<number | undefined> = []) => {
    const inventory = await listWorktrees(fixture.main, { env: fixture.env });
    if (inventory.kind !== "inventory") throw new Error("missing inventory");
    const run: typeof fixture.run = async (args, cwd, options) => {
      recorded.push([...args]);
      limits.push(options?.outputLimit);
      return fixture.run(args, cwd, options);
    };
    return inspectRemovalSafety({ run, checkoutPath: checkout, checkoutId: "checkout-linked", records: inventory.records });
  };
  const blockedCode = (result: Awaited<ReturnType<typeof inspectRemovalSafety>>) => "blocked" in result ? result.blocked.detail.code : undefined;
  const addSubmodule = async (fixture: Fixture) => {
    const sub = path.join(fixture.root, "sub");
    await fixture.git(["init", "--initial-branch=main", sub]);
    await fixture.git(["commit", "--allow-empty", "-m", "sub"], sub);
    await fixture.git(["submodule", "add", "../sub", "mods/sub"], fixture.main);
    await fixture.git(["commit", "-m", "add submodule"], fixture.main);
  };

  test("an initialized submodule blocks", async () => {
    await withRepository(async fixture => {
      await addSubmodule(fixture);
      const checkout = await addLinked(fixture);
      await fixture.git(["submodule", "update", "--init"], checkout);
      await writeFile(path.join(checkout, "README.md"), "changed\n");
      const result = await inspect(fixture, checkout);
      expect(blockedCode(result)).toBe("nested-dependency");
    });
  }, REAL_GIT_TIMEOUT);

  test("an uninitialized gitlink does not block", async () => {
    await withRepository(async fixture => {
      await addSubmodule(fixture);
      const checkout = await addLinked(fixture);
      await writeFile(path.join(checkout, "README.md"), "changed\n");
      const result = await inspect(fixture, checkout);
      expect(blockedCode(result)).toBeUndefined();
      expect("clear" in result && result.localData?.tracked?.sample).toEqual(["README.md"]);
    });
  }, REAL_GIT_TIMEOUT);

  test("an untracked nested repository blocks", async () => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      await fixture.git(["init", path.join(checkout, "nested")]);
      const result = await inspect(fixture, checkout);
      expect(blockedCode(result)).toBe("nested-dependency");
      expect("blocked" in result && result.blocked.detail.message).toContain("(nested)");
    });
  }, REAL_GIT_TIMEOUT);

  test("a repository at the root of an ignored directory blocks", async () => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      await fixture.git(["init", path.join(checkout, "ignored")]);
      expect(blockedCode(await inspect(fixture, checkout))).toBe("nested-dependency");
    });
  }, REAL_GIT_TIMEOUT);

  test("an embedded gitlink without .gitmodules blocks", async () => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      const embedded = path.join(checkout, "embedded");
      await fixture.git(["init", "--initial-branch=main", embedded]);
      await fixture.git(["commit", "--allow-empty", "-m", "embedded"], embedded);
      await fixture.git(["add", "embedded"], checkout);
      await fixture.git(["commit", "-m", "embed"], checkout);
      await writeFile(path.join(checkout, "scratch.txt"), "scratch\n");
      const recorded: string[][] = [];
      expect(blockedCode(await inspect(fixture, checkout, recorded))).toBe("nested-dependency");
      expect(recorded.some(args => args[0] === "ls-files")).toBe(true);
    });
  }, REAL_GIT_TIMEOUT);

  test.each([
    ["a clean tree", async (_checkout: string) => {}],
    ["an ignored-only tree", async (checkout: string) => {
      await writeFile(path.join(checkout, ".env"), "SECRET=1\n");
      await mkdir(path.join(checkout, "ignored"), { recursive: true });
      await writeFile(path.join(checkout, "ignored", "cache.bin"), "x");
    }],
  ])("%s is inspected through the index too, under its own larger bound", async (_label, prepare) => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      await prepare(checkout);
      const recorded: string[][] = [];
      const limits: Array<number | undefined> = [];
      const result = await inspect(fixture, checkout, recorded, limits);
      expect(blockedCode(result)).toBeUndefined();
      const probe = recorded.findIndex(args => args[0] === "ls-files");
      expect(probe).toBeGreaterThanOrEqual(0);
      expect(limits[probe]).toBe(INDEX_OUTPUT_LIMIT);
      // Every other probe keeps the runner's default bound.
      expect(limits.filter((_limit, index) => index !== probe).every(limit => limit === undefined)).toBe(true);
    });
  }, REAL_GIT_TIMEOUT);

  test.each([
    ["a clean tree", async (_checkout: string) => {}],
    ["a tree with local data", async (checkout: string) => { await writeFile(path.join(checkout, "scratch.txt"), "scratch\n"); }],
  ])("a repository nested inside a tracked directory blocks (%s)", async (_label, prepare) => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      await mkdir(path.join(checkout, "lib", "deep"), { recursive: true });
      await writeFile(path.join(checkout, "lib", "deep", "a.txt"), "a\n");
      await fixture.git(["add", "lib"], checkout);
      await fixture.git(["commit", "-m", "lib"], checkout);
      // `lib/` becomes a repository of its own; the outer status stays clean.
      await fixture.git(["init", "--initial-branch=main", path.join(checkout, "lib")]);
      await fixture.git(["add", "deep/a.txt"], path.join(checkout, "lib"));
      await fixture.git(["commit", "-m", "inner"], path.join(checkout, "lib"));
      await prepare(checkout);
      const result = await inspect(fixture, checkout);
      expect(blockedCode(result)).toBe("nested-dependency");
      expect("blocked" in result && result.blocked.detail.message).toContain("(lib)");
    });
  }, REAL_GIT_TIMEOUT);

  test("a failing index probe fails closed", async () => {
    await withRepository(async fixture => {
      const checkout = await addLinked(fixture);
      await writeFile(path.join(checkout, "scratch.txt"), "scratch\n");
      const inventory = await listWorktrees(fixture.main, { env: fixture.env });
      if (inventory.kind !== "inventory") throw new Error("missing inventory");
      const run: typeof fixture.run = async (args, cwd) => args[0] === "ls-files"
        ? { exitCode: 0, stdout: "", stderr: "", timedOut: false, outputExceeded: true }
        : fixture.run(args, cwd);
      const result = await inspectRemovalSafety({ run, checkoutPath: checkout, checkoutId: "checkout-linked", records: inventory.records });
      expect("blocked" in result && result.blocked.detail).toMatchObject({ code: "identity-uncertain", message: "The worktree's files could not be inspected, so it was not removed." });
    });
  }, REAL_GIT_TIMEOUT);
});

describe("undecodable paths fail closed", () => {
  // The runner decodes leniently: bytes that are not UTF-8 arrive as U+FFFD,
  // which no on-disk lookup can resolve back to the real name.
  const inspectWith = async (outputs: { status?: string; index?: string }) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "uatu-delete-undecodable-"));
    try {
      return await inspectRemovalSafety({
        checkoutPath: root,
        checkoutId: "checkout-undecodable",
        records: [{ path: root, head: "abc", branch: "topic", bare: false, detached: false, locked: false, lockReason: null, prunable: false }],
        run: async args => ({
          exitCode: 0,
          stdout: args[0] === "rev-parse"
            ? args.flatMap((arg, index) => arg === "--git-path" ? [path.join(root, "gitdir", args[index + 1]!)] : []).join("\n") + "\n"
            : args[0] === "status" ? outputs.status ?? "" : args[0] === "ls-files" ? outputs.index ?? "" : "",
          stderr: "", timedOut: false, outputExceeded: false,
        }),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };
  const uninspectable = { code: "identity-uncertain", message: "The worktree's files could not be inspected, so it was not removed." };

  test.each([
    ["an untracked directory", "?? b\uFFFD/\0"],
    ["an untracked file", "?? notes-\uFFFD.txt\0"],
    ["an ignored entry", "!! cache\uFFFD/\0"],
    ["a tracked change", " M src/\uFFFD.ts\0"],
  ])("a status path with U+FFFD (%s) is refused, never described", async (_label, status) => {
    const result = await inspectWith({ status });
    expect("blocked" in result && result.blocked.detail).toMatchObject(uninspectable);
  });

  test("an index path with U+FFFD is refused even when the status is clean", async () => {
    const result = await inspectWith({ index: "100644 0123456789012345678901234567890123456789 0\tlib\uFFFD/a.txt\0" });
    expect("blocked" in result && result.blocked.detail).toMatchObject(uninspectable);
  });

  test("well-formed synthetic output is described normally", async () => {
    const result = await inspectWith({ status: "?? notes.txt\0", index: "100644 0123456789012345678901234567890123456789 0\tREADME.md\0" });
    expect("clear" in result && result.localData?.untracked?.sample).toEqual(["notes.txt"]);
  });
});
