import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { parseHTML } from "linkedom";
import type { FileTree, FileTreeDirectoryHandle } from "@pierre/trees";

import type { ChangedFileSummary, RepositorySnapshot, RootGroup } from "../shared/types";
import {
  ancestorPaths,
  buildPathInputs,
  computeFilesPaneFilterMembership,
  computeFilteredPaths,
  reconcileFilterExpansion,
  TreeView,
  type FilesPaneFilterMembership,
} from "./tree-view";

describe("TreeView selection lifecycle with the real library", () => {
  let container: HTMLElement & { __pierreFileTree?: FileTree };
  let view: TreeView;
  let selections: string[];
  let restoreGlobals: () => void;
  const leaf = "guides/deep/active.md";
  const other = "other/deep/next.md";
  const paths = [leaf, "guides/deep/sibling.md", other, "kept/open.md"];

  function roots(entries = paths, ids: Record<string, string> = {}): RootGroup[] {
    return [makeRoot({
      id: "r1", label: "project",
      docs: entries.map(relativePath => ({
        id: ids[relativePath] ?? relativePath,
        name: relativePath.split("/").at(-1)!, relativePath,
        rootId: "r1", mtimeMs: 0, kind: "markdown",
      })),
    })];
  }

  function tree(): FileTree {
    expect(container.__pierreFileTree).toBeDefined();
    return container.__pierreFileTree!;
  }

  function directory(path: string): FileTreeDirectoryHandle {
    const handle = tree().getItem(path);
    expect(handle?.isDirectory()).toBe(true);
    return handle as FileTreeDirectoryHandle;
  }

  beforeEach(() => {
    const { document, window } = parseHTML("<!doctype html><html><body><div id='tree'></div></body></html>");
    const globals: Record<string, unknown> = {
      document, window, HTMLElement: window.HTMLElement, Element: window.Element,
      HTMLStyleElement: window.HTMLStyleElement, Node: window.Node,
      HTMLTemplateElement: window.HTMLTemplateElement,
      HTMLDivElement: window.HTMLDivElement,
      SVGElement: window.SVGElement,
      ShadowRoot: window.ShadowRoot,
      MutationObserver: window.MutationObserver,
      matchMedia: () => ({ matches: false }),
    };
    const previous = Object.entries(globals).map(([key]) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    // linkedom has no layout/scroll implementation. Supply browser defaults,
    // not a fake tree: all model mutations and callbacks remain Pierre's.
    const prototype = window.HTMLElement.prototype;
    const layout = { scrollTop: 0, scrollLeft: 0, clientHeight: 600, clientWidth: 300 };
    const previousLayout = Object.keys(layout).map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)] as const);
    for (const [key, value] of Object.entries(layout)) {
      Object.defineProperty(prototype, key, { configurable: true, writable: true, value });
    }
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    restoreGlobals = () => {
      for (const [key, descriptor] of previousLayout) {
        if (descriptor) Object.defineProperty(prototype, key, descriptor);
        else Reflect.deleteProperty(prototype, key);
      }
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    };
    container = document.getElementById("tree") as typeof container;
    selections = [];
    view = new TreeView({ container, onSelectDocument: id => selections.push(id) });
  });

  afterEach(() => {
    try {
      view.dispose();
      expect(selections).toEqual([]);
    } finally {
      restoreGlobals();
    }
  });

  it("reveals an initial nested selection without emitting a navigation echo", () => {
    view.update(roots(), leaf);
    expect(directory("guides/").isExpanded()).toBe(true);
    expect(directory("guides/deep/").isExpanded()).toBe(true);
    expect(directory("other/").isExpanded()).toBe(false);
    expect(tree().getSelectedPaths()).toEqual([leaf]);
  });

  for (const refresh of ["unchanged", "addition", "removal", "rename"] as const) {
    it(`preserves collapsed ancestors and hidden leaf selection after ${refresh}`, () => {
      view.update(roots(), leaf);
      directory("guides/").collapse();
      expect(directory("guides/deep/").isExpanded()).toBe(true);
      directory("kept/").expand();
      // Folder interactions can leave a directory selected. Synchronization
      // must restore the application's leaf without revealing its ancestors.
      tree().getItem(leaf)!.deselect();
      directory("guides/").select();
      const next = refresh === "addition" ? [...paths, "new/file.md"]
        : refresh === "removal" ? paths.filter(path => path !== other)
        : refresh === "rename" ? paths.map(path => path === other ? "renamed/file.md" : path)
        : paths;
      view.update(roots(next), leaf);
      expect(directory("guides/").isExpanded()).toBe(false);
      expect(directory("guides/deep/").isExpanded()).toBe(true);
      expect(directory("kept/").isExpanded()).toBe(true);
      expect(tree().getSelectedPaths()).toEqual([leaf]);
      if (refresh === "addition") expect(directory("new/").isExpanded()).toBe(false);
      directory("guides/").expand();
      expect(tree().getItem(leaf)?.isSelected()).toBe(true);
    });
  }

  it("immediately restores the hidden active leaf after directory selection without moving folder focus", () => {
    view.update(roots(), leaf);
    const folder = directory("guides/");
    folder.collapse();
    folder.focus();
    const focusedPath = tree().getFocusedPath();
    expect(focusedPath).not.toBeNull();
    tree().getItem(leaf)!.deselect();
    folder.select();
    // No update() or refresh: the real selection callback reconciles now.
    expect(tree().getSelectedPaths()).toEqual([leaf]);
    expect(folder.isExpanded()).toBe(false);
    expect(tree().getFocusedPath()).toBe(focusedPath);
    expect(selections).toEqual([]);
  });

  for (const nextSelection of [null, "unavailable.md"]) {
    it(`does not resurrect the previous leaf on directory selection after selecting ${nextSelection}`, () => {
      view.update(roots(), leaf);
      directory("guides/").collapse();
      view.update(roots(), nextSelection);
      const folder = directory("guides/");
      folder.focus();
      const focusedPath = tree().getFocusedPath();
      expect(focusedPath).not.toBeNull();
      folder.select();
      expect(tree().getSelectedPaths()).not.toContain(leaf);
      expect(folder.isExpanded()).toBe(false);
      expect(tree().getFocusedPath()).toBe(focusedPath);
      expect(selections).toEqual([]);
    });
  }

  it("reveals a changed document additively", () => {
    view.update(roots(), leaf);
    directory("guides/").collapse();
    directory("kept/").expand();
    view.update(roots(), other);
    expect(directory("other/").isExpanded()).toBe(true);
    expect(directory("other/deep/").isExpanded()).toBe(true);
    expect(directory("kept/").isExpanded()).toBe(true);
    expect(directory("guides/").isExpanded()).toBe(false);
    expect(tree().getSelectedPaths()).toEqual([other]);
  });

  it("forwards a library selection after refresh instead of leaving the update guard active", () => {
    view.update(roots(), leaf);
    view.update(roots([...paths, "new.md"]), leaf);
    expect(selections).toEqual([]);
    tree().getItem(leaf)!.deselect();
    tree().getItem(other)!.select();
    expect(selections).toEqual([other]);
    selections.length = 0;
    view.update(roots([...paths, "new.md"]), other);
    expect(tree().getSelectedPaths()).toEqual([other]);
  });

  it("reveals the same document after explicit selection clearing", () => {
    view.update(roots(), leaf);
    directory("guides/").collapse();
    view.update(roots(), null);
    view.update(roots(), leaf);
    expect(directory("guides/").isExpanded()).toBe(true);
    expect(tree().getSelectedPaths()).toEqual([leaf]);
  });

  it("keeps a surviving ancestor collapsed when a represented same-path selection returns", () => {
    view.update(roots(), leaf);
    directory("guides/").collapse();
    view.update(roots(paths.filter(path => path !== leaf)), leaf);
    expect(directory("guides/").isExpanded()).toBe(false);
    view.update(roots(), leaf);
    expect(directory("guides/").isExpanded()).toBe(false);
    expect(tree().getSelectedPaths()).toEqual([leaf]);
    directory("guides/").expand();
    expect(tree().getItem(leaf)?.isSelected()).toBe(true);
  });

  it("reveals a different unavailable selection when it first becomes represented", () => {
    const missing = paths.filter(path => path !== other);
    view.update(roots(missing), leaf);
    directory("kept/").expand();
    view.update(roots(missing), other);
    view.update(roots(), other);
    expect(directory("other/").isExpanded()).toBe(true);
    expect(directory("other/deep/").isExpanded()).toBe(true);
    expect(directory("kept/").isExpanded()).toBe(true);
    expect(tree().getSelectedPaths()).toEqual([other]);
  });

  it("reveals a changed resolved path even when document identity is unchanged", () => {
    view.update(roots(paths, { [leaf]: "stable-id" }), "stable-id");
    const moved = "moved/deep/active.md";
    view.update(roots(paths.map(path => path === leaf ? moved : path), { [moved]: "stable-id" }), "stable-id");
    expect(directory("moved/").isExpanded()).toBe(true);
    expect(directory("moved/deep/").isExpanded()).toBe(true);
    expect(tree().getSelectedPaths()).toEqual([moved]);
  });

  it("reveals a changed document identity even at the same tree path", () => {
    view.update(roots(), leaf);
    directory("guides/").collapse();
    view.update(roots(paths, { [leaf]: "replacement-id" }), "replacement-id");
    expect(directory("guides/").isExpanded()).toBe(true);
    expect(tree().getSelectedPaths()).toEqual([leaf]);
  });

  it("clears mounted state on disposal and reveals on a fresh mount", () => {
    view.update(roots(), leaf);
    directory("guides/").collapse();
    const mounted = tree();
    view.dispose();
    expect(container.__pierreFileTree).toBeUndefined();
    expect(view.getVisibleLeafCount()).toBe(0);
    expect(view.getVisibleBinaryLeafCount()).toBe(0);
    view.update(roots(), leaf);
    expect(tree()).not.toBe(mounted);
    expect(directory("guides/").isExpanded()).toBe(true);
    expect(tree().getSelectedPaths()).toEqual([leaf]);
  });
});

function makeRoot(overrides: Partial<RootGroup> & { id: string; label: string; docs: RootGroup["docs"] }): RootGroup {
  return {
    path: `/tmp/${overrides.id}`,
    hiddenCount: 0,
    ...overrides,
  };
}

describe("buildPathInputs", () => {
  it("does not prefix paths with the root label when there is a single root", () => {
    const root = makeRoot({
      id: "r1",
      label: "myproject",
      docs: [
        {
          id: "/abs/myproject/README.md",
          name: "README.md",
          relativePath: "README.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
        {
          id: "/abs/myproject/src/index.ts",
          name: "index.ts",
          relativePath: "src/index.ts",
          mtimeMs: 0,
          rootId: "r1",
          kind: "text",
        },
      ],
    });

    const { paths, mapping, rootPrefix } = buildPathInputs([root]);
    // Single-root: paths are taken verbatim, so top-level files show at the
    // top of the tree (matches VS Code's single-folder workspace UX).
    expect(paths).toEqual(["README.md", "src/index.ts"]);
    expect(mapping.get("README.md")).toBe("/abs/myproject/README.md");
    expect(mapping.get("src/index.ts")).toBe("/abs/myproject/src/index.ts");
    expect(rootPrefix.get("r1")).toBe("");
  });

  it("prefixes every file with the root label when there are multiple roots", () => {
    const left = makeRoot({
      id: "r1",
      label: "docs",
      docs: [
        {
          id: "/a/docs/a.md",
          name: "a.md",
          relativePath: "a.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
      ],
    });
    const right = makeRoot({
      id: "r2",
      label: "site",
      docs: [
        {
          id: "/b/site/b.md",
          name: "b.md",
          relativePath: "b.md",
          mtimeMs: 0,
          rootId: "r2",
          kind: "markdown",
        },
      ],
    });

    const { paths, rootPrefix } = buildPathInputs([left, right]);
    expect(paths).toEqual(["docs/a.md", "site/b.md"]);
    expect(rootPrefix.get("r1")).toBe("docs/");
    expect(rootPrefix.get("r2")).toBe("site/");
  });

  it("disambiguates duplicate labels with a numeric suffix in multi-root mode", () => {
    const left = makeRoot({
      id: "r1",
      label: "docs",
      docs: [
        {
          id: "/a/docs/a.md",
          name: "a.md",
          relativePath: "a.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
      ],
    });
    const right = makeRoot({
      id: "r2",
      label: "docs",
      docs: [
        {
          id: "/b/docs/b.md",
          name: "b.md",
          relativePath: "b.md",
          mtimeMs: 0,
          rootId: "r2",
          kind: "markdown",
        },
      ],
    });

    const { paths, rootPrefix } = buildPathInputs([left, right]);
    expect(paths).toEqual(["docs/a.md", "docs (2)/b.md"]);
    expect(rootPrefix.get("r1")).toBe("docs/");
    expect(rootPrefix.get("r2")).toBe("docs (2)/");
  });

  it("falls back to 'root' when a multi-root label is blank", () => {
    const left = makeRoot({
      id: "r1",
      label: "   ",
      docs: [
        {
          id: "/nameless/README.md",
          name: "README.md",
          relativePath: "README.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
      ],
    });
    const right = makeRoot({
      id: "r2",
      label: "other",
      docs: [
        {
          id: "/other/README.md",
          name: "README.md",
          relativePath: "README.md",
          mtimeMs: 0,
          rootId: "r2",
          kind: "markdown",
        },
      ],
    });
    const { paths } = buildPathInputs([left, right]);
    expect(paths).toEqual(["root/README.md", "other/README.md"]);
  });

  it("strips a leading slash from relativePath if present (defensive)", () => {
    const root = makeRoot({
      id: "r1",
      label: "proj",
      docs: [
        {
          id: "/abs/proj/README.md",
          name: "README.md",
          relativePath: "/README.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
      ],
    });
    const { paths } = buildPathInputs([root]);
    expect(paths).toEqual(["README.md"]);
  });

  it("returns empty paths and an empty mapping when there are no roots", () => {
    const { paths, mapping, rootPrefix } = buildPathInputs([]);
    expect(paths).toEqual([]);
    expect(mapping.size).toBe(0);
    expect(rootPrefix.size).toBe(0);
  });
});

describe("ancestorPaths", () => {
  it("returns each ancestor directory from outermost to innermost, trailing slash", () => {
    expect(ancestorPaths("a/b/c/leaf.md")).toEqual(["a/", "a/b/", "a/b/c/"]);
  });

  it("returns an empty array for a top-level file (no ancestors)", () => {
    expect(ancestorPaths("README.md")).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(ancestorPaths("")).toEqual([]);
  });

  it("handles a single nested directory", () => {
    expect(ancestorPaths("src/index.ts")).toEqual(["src/"]);
  });

  it("handles multi-root-prefixed paths consistently", () => {
    expect(ancestorPaths("myproject/src/index.ts")).toEqual(["myproject/", "myproject/src/"]);
  });
});

describe("computeFilteredPaths", () => {
  const root = makeRoot({
    id: "r1",
    label: "proj",
    docs: [
      {
        id: "/abs/proj/README.md",
        name: "README.md",
        relativePath: "README.md",
        mtimeMs: 0,
        rootId: "r1",
        kind: "markdown",
      },
      {
        id: "/abs/proj/src/auth/login.ts",
        name: "login.ts",
        relativePath: "src/auth/login.ts",
        mtimeMs: 0,
        rootId: "r1",
        kind: "text",
      },
      {
        id: "/abs/proj/src/auth/oauth.ts",
        name: "oauth.ts",
        relativePath: "src/auth/oauth.ts",
        mtimeMs: 0,
        rootId: "r1",
        kind: "text",
      },
      {
        id: "/abs/proj/docs/glossary.md",
        name: "glossary.md",
        relativePath: "docs/glossary.md",
        mtimeMs: 0,
        rootId: "r1",
        kind: "markdown",
      },
    ],
  });

  it("keeps only docs in the allow-list plus their ancestor directories", () => {
    const filter: FilesPaneFilterMembership = {
      allowedByRoot: new Map([["r1", new Set(["src/auth/login.ts", "docs/glossary.md"])]]),
    };
    const { rootPrefix } = buildPathInputs([root]);
    const { paths, ancestors } = computeFilteredPaths([root], rootPrefix, filter);
    expect(new Set(paths)).toEqual(new Set(["src/auth/login.ts", "docs/glossary.md"]));
    expect(new Set(ancestors)).toEqual(new Set(["src/", "src/auth/", "docs/"]));
  });

  it("returns empty arrays when no doc matches the allow-list", () => {
    const filter: FilesPaneFilterMembership = {
      allowedByRoot: new Map([["r1", new Set(["nonexistent.md"])]]),
    };
    const { rootPrefix } = buildPathInputs([root]);
    const { paths, ancestors } = computeFilteredPaths([root], rootPrefix, filter);
    expect(paths).toEqual([]);
    expect(ancestors).toEqual([]);
  });

  it("filters every root out when the per-root allow-list is missing", () => {
    const filter: FilesPaneFilterMembership = { allowedByRoot: new Map() };
    const { rootPrefix } = buildPathInputs([root]);
    const { paths } = computeFilteredPaths([root], rootPrefix, filter);
    expect(paths).toEqual([]);
  });

  it("respects multi-root prefixes when the chip's allow-list is per repo-root path", () => {
    const left = makeRoot({
      id: "r1",
      label: "docs",
      docs: [
        {
          id: "/a/docs/intro.md",
          name: "intro.md",
          relativePath: "intro.md",
          mtimeMs: 0,
          rootId: "r1",
          kind: "markdown",
        },
      ],
    });
    const right = makeRoot({
      id: "r2",
      label: "site",
      docs: [
        {
          id: "/b/site/index.md",
          name: "index.md",
          relativePath: "index.md",
          mtimeMs: 0,
          rootId: "r2",
          kind: "markdown",
        },
      ],
    });
    const filter: FilesPaneFilterMembership = {
      allowedByRoot: new Map([["r2", new Set(["index.md"])]]),
    };
    const { rootPrefix } = buildPathInputs([left, right]);
    const { paths } = computeFilteredPaths([left, right], rootPrefix, filter);
    expect(paths).toEqual(["site/index.md"]);
  });

  it("ignores any allow-list path not present in the doc list (defensive)", () => {
    const filter: FilesPaneFilterMembership = {
      allowedByRoot: new Map([["r1", new Set(["README.md", "ghost.md"])]]),
    };
    const { rootPrefix } = buildPathInputs([root]);
    const { paths, ancestors } = computeFilteredPaths([root], rootPrefix, filter);
    expect(paths).toEqual(["README.md"]);
    expect(ancestors).toEqual([]);
  });
});

describe("computeFilesPaneFilterMembership", () => {
  function makeChange(path: string, status = "M"): ChangedFileSummary {
    return { path, oldPath: null, status, additions: 0, deletions: 0, hunks: 0 };
  }

  function makeRepo(overrides: {
    id: string;
    watchedRootIds: string[];
    snapshot: Partial<Pick<RepositorySnapshot, "status" | "changedFiles" | "gitIgnoredFiles">>;
  }): RepositorySnapshot {
    return {
      id: overrides.id,
      rootPath: `/tmp/${overrides.id}`,
      label: overrides.id,
      watchedRootIds: overrides.watchedRootIds,
      metadata: {
        id: overrides.id,
        rootPath: `/tmp/${overrides.id}`,
        label: overrides.id,
        watchedRootIds: overrides.watchedRootIds,
        status: "git",
        branch: "main",
        detached: false,
        commitShort: null,
        dirty: false,
        message: null,
      },
      status: "available",
      base: { mode: "fallback", ref: "main", mergeBase: null, compareTarget: "base", comparedAgainstRef: "main", targetsCollapsed: false },
      changedFiles: [],
      gitIgnoredFiles: [],
      configWarnings: [],
      message: null,
      commitLog: [],
      ...overrides.snapshot,
    };
  }

  it("collects changedFiles per repo, keyed by watched-root id", () => {
    const repo = makeRepo({
      id: "r1",
      watchedRootIds: ["root-1"],
      snapshot: {
        changedFiles: [makeChange("src/app.ts", "M"), makeChange("README.md", "?")],
      },
    });
    const membership = computeFilesPaneFilterMembership([repo]);
    const set = membership.allowedByRoot.get("root-1");
    expect(set).toBeDefined();
    expect(set).toEqual(new Set(["src/app.ts", "README.md"]));
  });

  it("excludes gitIgnoredFiles from the change set", () => {
    const repo = makeRepo({
      id: "r1",
      watchedRootIds: ["root-1"],
      snapshot: {
        changedFiles: [makeChange("src/app.ts", "M")],
        gitIgnoredFiles: [".claude/settings.local.json"],
      },
    });
    const membership = computeFilesPaneFilterMembership([repo]);
    const set = membership.allowedByRoot.get("root-1") ?? new Set();
    expect(set.has("src/app.ts")).toBe(true);
    expect(set.has(".claude/settings.local.json")).toBe(false);
  });

  it("skips repositories whose change data is not available", () => {
    const repo = makeRepo({
      id: "r1",
      watchedRootIds: ["root-1"],
      snapshot: { status: "non-git", changedFiles: [makeChange("README.md", "M")] },
    });
    const membership = computeFilesPaneFilterMembership([repo]);
    expect(membership.allowedByRoot.size).toBe(0);
  });

  it("strips a leading slash on incoming paths so the allow-set matches normalised doc paths", () => {
    const repo = makeRepo({
      id: "r1",
      watchedRootIds: ["root-1"],
      snapshot: {
        changedFiles: [makeChange("/src/app.ts", "M"), makeChange("/dist/bundle.js", "M")],
      },
    });
    const membership = computeFilesPaneFilterMembership([repo]);
    const set = membership.allowedByRoot.get("root-1") ?? new Set();
    expect(set.has("src/app.ts")).toBe(true);
    expect(set.has("/src/app.ts")).toBe(false);
    expect(set.has("dist/bundle.js")).toBe(true);
  });

  it("fans out one repository's change set to every watched-root id it owns", () => {
    const repo = makeRepo({
      id: "r1",
      watchedRootIds: ["root-a", "root-b"],
      snapshot: { changedFiles: [makeChange("shared.ts", "M")] },
    });
    const membership = computeFilesPaneFilterMembership([repo]);
    expect(membership.allowedByRoot.get("root-a")).toEqual(new Set(["shared.ts"]));
    expect(membership.allowedByRoot.get("root-b")).toEqual(new Set(["shared.ts"]));
  });
});

describe("reconcileFilterExpansion", () => {
  it("snapshots the user's currently-expanded set when transitioning All → Changed", () => {
    const result = reconcileFilterExpansion({
      previousFilterKind: "all",
      nextFilterKind: "changed",
      autoExpanded: ["src/", "src/auth/"],
      currentlyExpanded: ["src/", "tests/", "docs/guides/"],
      storedSnapshot: null,
    });
    expect(result.initialExpandedPaths).toEqual(["src/", "src/auth/"]);
    expect(result.nextSnapshot).toEqual(["src/", "tests/", "docs/guides/"]);
  });

  it("restores the snapshot as initial expansion when transitioning Changed → All", () => {
    const result = reconcileFilterExpansion({
      previousFilterKind: "changed",
      nextFilterKind: "all",
      autoExpanded: ["src/"],
      currentlyExpanded: null,
      storedSnapshot: ["src/", "tests/", "docs/guides/"],
    });
    // Snapshot directories restored alongside the new auto-expand reveal,
    // deduplicated and in first-seen order.
    expect(result.initialExpandedPaths).toEqual(["src/", "tests/", "docs/guides/"]);
    // Snapshot is consumed on restore so a subsequent All → Changed → All
    // cycle without further user expansion does not double-feed stale dirs.
    expect(result.nextSnapshot).toBeNull();
  });

  it("does not lose user-opened directories across All → Changed → All", () => {
    const after_all_to_changed = reconcileFilterExpansion({
      previousFilterKind: "all",
      nextFilterKind: "changed",
      autoExpanded: ["src/", "src/auth/"],
      currentlyExpanded: ["src/", "src/auth/oauth/", "tests/"],
      storedSnapshot: null,
    });
    const after_changed_to_all = reconcileFilterExpansion({
      previousFilterKind: "changed",
      nextFilterKind: "all",
      autoExpanded: [],
      currentlyExpanded: null,
      storedSnapshot: after_all_to_changed.nextSnapshot,
    });
    expect(after_changed_to_all.initialExpandedPaths).toEqual([
      "src/",
      "src/auth/oauth/",
      "tests/",
    ]);
  });

  it("passes the auto-expand reveal through unchanged on same-kind transitions", () => {
    const stayAll = reconcileFilterExpansion({
      previousFilterKind: "all",
      nextFilterKind: "all",
      autoExpanded: ["docs/"],
      currentlyExpanded: null,
      storedSnapshot: null,
    });
    expect(stayAll.initialExpandedPaths).toEqual(["docs/"]);
    expect(stayAll.nextSnapshot).toBeNull();

    const stayChanged = reconcileFilterExpansion({
      previousFilterKind: "changed",
      nextFilterKind: "changed",
      autoExpanded: ["src/auth/"],
      currentlyExpanded: null,
      storedSnapshot: ["src/", "docs/guides/"],
    });
    expect(stayChanged.initialExpandedPaths).toEqual(["src/auth/"]);
    // Snapshot is preserved across same-kind transitions so the next
    // Changed → All edge can still restore it.
    expect(stayChanged.nextSnapshot).toEqual(["src/", "docs/guides/"]);
  });

  it("falls back to bare auto-expand when no snapshot exists on Changed → All", () => {
    const result = reconcileFilterExpansion({
      previousFilterKind: "changed",
      nextFilterKind: "all",
      autoExpanded: ["src/"],
      currentlyExpanded: null,
      storedSnapshot: null,
    });
    expect(result.initialExpandedPaths).toEqual(["src/"]);
    expect(result.nextSnapshot).toBeNull();
  });
});
