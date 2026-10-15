import { afterEach, describe, expect, test } from "bun:test";

import { appState } from "./state";
import { clearDocumentSelection, getSelectedDestination, getSelectionGeneration, setPreviewMode, setSelectedId } from "./selection";

const initialSelectedId = appState.selectedId;
const initialPreviewMode = appState.previewMode;
const initialSelectionCleared = appState.selectionCleared;

afterEach(() => {
  appState.selectedId = initialSelectedId;
  appState.previewMode = initialPreviewMode;
  appState.selectionCleared = initialSelectionCleared;
});

describe("selection mutators", () => {
  test("closing is distinct from startup null and invalidates even same-document reselection", () => {
    setSelectedId("/watch/docs/readme.md", "navigation");
    const generation = getSelectionGeneration();
    clearDocumentSelection();
    expect(appState.selectedId).toBeNull();
    expect(appState.selectionCleared).toBe(true);
    expect(getSelectionGeneration()).not.toBe(generation);
    setSelectedId(null); // background reconciliation cannot erase intent
    expect(appState.selectionCleared).toBe(true);
    setSelectedId("/watch/docs/readme.md", "navigation");
    expect(appState.selectionCleared).toBe(false);
    expect(getSelectionGeneration()).not.toBe(generation);
  });
  test("setSelectedId assigns the selection", () => {
    setSelectedId("/watch/docs/readme.md");
    expect(appState.selectedId).toBe("/watch/docs/readme.md");
    setSelectedId(null);
    expect(appState.selectedId).toBeNull();
  });

  test("setPreviewMode assigns the preview surface", () => {
    setPreviewMode({ kind: "commit", repositoryId: "repo-1", sha: "abc123" });
    expect(appState.previewMode).toEqual({ kind: "commit", repositoryId: "repo-1", sha: "abc123" });
    setPreviewMode({ kind: "document" });
    expect(appState.previewMode).toEqual({ kind: "document" });
  });

  test("unavailable identity remains distinct from deliberate close", () => {
    const roots = appState.roots;
    try {
      appState.roots = [{ id: "docs", label: "docs", path: "/docs", hiddenCount: 0, docs: [
        { id: "/docs/a.md", rootId: "docs", name: "a.md", relativePath: "a.md", kind: "markdown", mtimeMs: 1 },
      ] }];
      setSelectedId("/docs/a.md");
      const generation = getSelectionGeneration();
      appState.roots = [];
      setSelectedId("/docs/a.md");
      expect(getSelectedDestination()?.relativePath).toBe("a.md");
      expect(getSelectionGeneration()).toBe(generation);
      expect(appState.selectionCleared).toBe(false);
      clearDocumentSelection();
      expect(getSelectedDestination()).toBeNull();
      expect(appState.selectedId).toBeNull();
    } finally {
      appState.roots = roots;
    }
  });
});
