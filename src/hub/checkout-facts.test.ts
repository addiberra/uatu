import { afterEach, expect, test, spyOn } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCheckoutFacts, readCheckoutState, inspectCheckoutFromFiles, repositoryContext, stampCheckoutIdentity } from "./worktree-git";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "uatu-checkout-facts-")));
  roots.push(root);
  await mkdir(path.join(root, ".git", "refs", "heads"), { recursive: true });
  await mkdir(path.join(root, ".git", "objects"));
  await writeFile(path.join(root, ".git", "config"), "[core]\nrepositoryformatversion = 0\n");
  await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/topic\n");
  return root;
}
const oid = "1234567890abcdef1234567890abcdef12345678";

test("malformed or unsupported config stays unavailable instead of inventing an unborn branch", async () => {
  const root = await fixture();
  const env = { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  for (const config of ["[broken\n", "[core]\nrepositoryformatversion = \"unterminated\n", "[core]\nrepositoryformatversion = nope\n", "[core]\n= value\n", "[core]\nfilemode = perhaps\n", "[core]\nautocrlf = perhaps\n", "[core]\nabbrev = perhaps\n", "[core]\nabbrev = 2\n"]) {
    await writeFile(path.join(root, ".git", "config"), config);
    const child = Bun.spawn(["git", "rev-parse", "--git-dir"], { cwd: root, env, stdout: "ignore", stderr: "pipe" });
    const error = await new Response(child.stderr).text();
    expect(await child.exited).toBe(128);
    expect(error).toMatch(/bad config|invalid config|invalid unit|bad boolean/i);
    expect((await readCheckoutState(root)).kind).toBe("unavailable");
    expect(await inspectCheckoutFromFiles(root)).toEqual({ present: true, identityReadable: false });
  }
  // These may be valid Git syntax, but are deliberately outside the bounded
  // recognizer; no includes, continuation/escape processing or future extensions.
  for (const config of [
    "[core]\nrepositoryformatversion = 0\n[user]\nname = One\"Two\"\n",
    "[core]\nrepositoryformatversion = 0\n[user]\nname = One\\\n Two\n",
    "[core]\nrepositoryformatversion = 1\n[extensions]\nfutureFormat = true\n",
    "[core]\nrepositoryformatversion = 1\n[extensions]\nworktreeConfig = true\n",
    "[core]\nrepositoryformatversion = 0\nworktree = /unsupported/worktree\n",
    "[core]\nrepositoryformatversion = 0\nbare = true\n",
  ]) {
    await writeFile(path.join(root, ".git", "config"), config);
    expect((await readCheckoutState(root)).kind).toBe("unavailable");
  }
  await writeFile(path.join(root, ".git", "config"), '# comment\n[core]\nrepositoryformatversion = 0\nfilemode = true ; comment\nbare = false\n[user]\nname = "Fictional Example"\n[remote "origin"]\nurl = https://example.test/repo.git\nfetch = +refs/heads/*:refs/remotes/origin/*\n');
  expect(await readCheckoutState(root)).toEqual({ kind: "unborn", name: "topic" });
});

test("invalid HEAD or incomplete admin metadata cannot retain a stamped checkout identity", async () => {
  const root = await fixture();
  const env = { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };
  await rm(path.join(root, ".git"), { recursive: true });
  for (const args of [["init", "--initial-branch=main"], ["commit", "--allow-empty", "-m", "initial"], ["worktree", "add", "-b", "topic", path.join(root, "linked")]]) {
    const child = Bun.spawn(["git", "-c", "commit.gpgsign=false", ...args], { cwd: root, env, stdout: "ignore", stderr: "pipe" });
    const error = await new Response(child.stderr).text();
    if (await child.exited !== 0) throw new Error(error);
  }
  const linked = path.join(root, "linked");
  const identity = await stampCheckoutIdentity(linked, { env });
  const context = await repositoryContext(linked, { env });
  if (context.kind !== "checkout") throw new Error("expected linked checkout");
  expect((await inspectCheckoutFromFiles(linked)).identity).toEqual(identity);
  const headFile = path.join(context.gitDirectory, "HEAD");
  const head = await readFile(headFile, "utf8");
  await writeFile(headFile, "invalid-head\n");
  expect((await repositoryContext(linked, { env })).kind).not.toBe("checkout"); // Independent Git-backed oracle.
  const spawn = spyOn(Bun, "spawn").mockImplementation(() => { throw new Error("list inspection must not run Git"); });
  try {
    expect(await inspectCheckoutFromFiles(linked)).toEqual({ present: true, identityReadable: false });
    await writeFile(headFile, head);
    expect((await inspectCheckoutFromFiles(linked)).identity).toEqual(identity);
    await rename(path.join(root, ".git", "objects"), path.join(root, ".git", "objects-kept"));
    expect(await inspectCheckoutFromFiles(linked)).toEqual({ present: true, identityReadable: false });
    expect(spawn).not.toHaveBeenCalled();
  } finally { spawn.mockRestore(); }
});

test("bounded HEAD facts distinguish unborn, loose/packed named, detached SHA1/SHA256 and non-Git", async () => {
  const root = await fixture();
  expect(await readCheckoutState(root)).toEqual({ kind: "unborn", name: "topic" });
  await writeFile(path.join(root, ".git", "refs", "heads", "topic"), `${oid}\n`);
  expect(await readCheckoutState(root)).toEqual({ kind: "named", name: "topic" });
  await rm(path.join(root, ".git", "refs", "heads", "topic"));
  await writeFile(path.join(root, ".git", "packed-refs"), `# pack-refs with: peeled\n${oid} refs/heads/topic\n`);
  expect(await readCheckoutState(root)).toEqual({ kind: "named", name: "topic" });
  for (const commit of [oid, "a".repeat(64)]) {
    await writeFile(path.join(root, ".git", "config"), commit.length === 64
      ? "[core]\nrepositoryformatversion = 1\n[extensions]\nobjectFormat = sha256\n"
      : "[core]\nrepositoryformatversion = 0\n");
    await writeFile(path.join(root, ".git", "HEAD"), `${commit}\n`);
    expect(await readCheckoutState(root)).toEqual({ kind: "detached", commit });
    if (commit.length === 64) {
      await writeFile(path.join(root, ".git", "config"), "[core]\nrepositoryformatversion = 0\n");
      expect((await readCheckoutState(root)).kind).toBe("unavailable");
    }
  }
  await rm(path.join(root, ".git"), { recursive: true });
  expect(await readCheckoutState(root)).toEqual({ kind: "non-git" });
  expect((await readCheckoutState(path.join(root, "missing"))).kind).toBe("unavailable");
});

test("incomplete, unsupported and oversized administrative data never becomes unborn or non-Git", async () => {
  const root = await fixture();
  for (const head of ["", "ref: refs/tags/topic", "ref: refs/heads/../../outside", "x".repeat(4097), "ref: refs/heads/a.lock"]) {
    await writeFile(path.join(root, ".git", "HEAD"), head);
    expect((await readCheckoutState(root)).kind).toBe("unavailable");
  }
  await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/topic\n");
  for (const config of ["[extensions]\nrefStorage = reftable\n", "[include]\npath = elsewhere\n", "x".repeat(65537)]) {
    await writeFile(path.join(root, ".git", "config"), config);
    expect((await readCheckoutState(root)).kind).toBe("unavailable");
    expect((await readCheckoutFacts(root)).head).toEqual({ kind: "branch", branch: "topic" });
  }
  await writeFile(path.join(root, ".git", "config"), "[extensions]\nrefStorage = files\n");
  expect((await readCheckoutState(root)).kind).toBe("unborn");
  await writeFile(path.join(root, ".git", "packed-refs"), "x".repeat(1024 * 1024 + 1));
  expect((await readCheckoutState(root)).kind).toBe("unavailable");
  const nested = path.join(root, "nested");
  await mkdir(nested);
  expect((await readCheckoutState(nested)).kind).toBe("unavailable");
});

test("linked HEAD uses commondir refs; list identity matches the existing Git/stamp owner and detects replacement", async () => {
  const root = await fixture();
  const env = { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };
  // Replace the hand-built metadata with a real disposable Git repository.
  await rm(path.join(root, ".git"), { recursive: true });
  async function git(args: string[]) {
    const child = Bun.spawn(["git", "-c", "commit.gpgsign=false", ...args], { cwd: root, env, stdout: "ignore", stderr: "pipe" });
    const error = await new Response(child.stderr).text();
    if (await child.exited !== 0) throw new Error(error);
  }
  await git(["init", "--initial-branch=main"]);
  await git(["commit", "--allow-empty", "-m", "initial"]);
  const linked = path.join(root, "linked");
  await git(["worktree", "add", "-b", "topic", linked]);
  const identity = await stampCheckoutIdentity(linked, { env });
  expect(await readCheckoutState(linked)).toEqual({ kind: "named", name: "topic" });
  expect((await inspectCheckoutFromFiles(linked)).identity).toEqual(identity);
  const context = await repositoryContext(linked, { env });
  if (context.kind !== "checkout") throw new Error("expected linked checkout");
  const configFile = path.join(root, ".git", "config");
  const config = await readFile(configFile, "utf8");
  for (const setting of ["autocrlf = true", "autocrlf = input", "abbrev = 7", "abbrev = auto", "abbrev = false", "hooksPath = .githooks", "fsmonitor = true", "editor = vi", "unrecognizedNonLayoutSetting = value"]) {
    await writeFile(configFile, `${config}\n[core]\n${setting}\n`);
    const oracle = await repositoryContext(linked, { env });
    if (oracle.kind !== "checkout") throw new Error("Git rejected ordinary config");
    expect(oracle.identity).toEqual(identity);
    const spawn = spyOn(Bun, "spawn").mockImplementation(() => { throw new Error("list inspection must not run Git"); });
    try {
      expect((await inspectCheckoutFromFiles(linked)).identity).toEqual(identity);
      expect(await readCheckoutState(linked)).toEqual({ kind: "named", name: "topic" });
      expect(spawn).not.toHaveBeenCalled();
    } finally { spawn.mockRestore(); }
  }
  await writeFile(configFile, config);
  // A branch fact needs ref contents; checkout identity does not. Git still
  // identifies this checkout when its valid packed refs exceed our read budget.
  await git(["pack-refs", "--all"]);
  const packedFile = path.join(root, ".git", "packed-refs");
  const packed = await readFile(packedFile, "utf8");
  await writeFile(packedFile, `${packed}${"# padding\n".repeat(110_000)}`);
  const oracle = await repositoryContext(linked, { env });
  if (oracle.kind !== "checkout") throw new Error("Git rejected packed refs");
  expect(oracle.identity).toEqual(identity);
  expect((await readCheckoutState(linked)).kind).toBe("unavailable");
  expect((await inspectCheckoutFromFiles(linked)).identity).toEqual(identity);
  await writeFile(packedFile, packed);
  await writeFile(path.join(context.gitDirectory, "uatu-checkout"), "invalid-stamp");
  expect((await inspectCheckoutFromFiles(linked)).identityReadable).toBe(false);
  await rm(path.join(context.gitDirectory, "uatu-checkout"));
  expect((await inspectCheckoutFromFiles(linked)).identity?.checkoutId).not.toBe(identity.checkoutId);
  await writeFile(path.join(context.gitDirectory, "gitdir"), path.join(root, "other", ".git"));
  expect((await inspectCheckoutFromFiles(linked)).identityReadable).toBe(false);
  await rm(linked, { recursive: true });
  expect(await inspectCheckoutFromFiles(linked)).toEqual({ present: false, identityReadable: true });
});
