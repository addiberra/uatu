import type { ViewLayout, ViewMode } from "../shared/types";

export type DocumentLoadToken = {
  generation: number;
  selectionGeneration: number;
  documentId: string;
  view: ViewMode;
  layout: ViewLayout;
  revision: string;
};

export function createDocumentLoadGuard(selectionGeneration: () => number = () => 0, revisionOf: (id: string) => string = () => "") {
  let latestGeneration = 0;
  let state: { documentId: string | null; status: "idle" | "pending-selection" | "ready" | "load-error" | "timeout" | "missing-target" } = { documentId: null, status: "idle" };
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };

  return {
    state: () => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    settle(token: DocumentLoadToken, status: typeof state.status): void {
      if (token.generation !== latestGeneration) return;
      state = { documentId: token.documentId, status };
      notify();
    },
    begin(documentId: string, view: ViewMode, layout: ViewLayout): DocumentLoadToken {
      const token = { generation: ++latestGeneration, selectionGeneration: selectionGeneration(), documentId, view, layout, revision: revisionOf(documentId) };
      state = { documentId, status: "pending-selection" };
      notify();
      return token;
    },
    isCurrent(
      token: DocumentLoadToken,
      selectedId: string | null,
      view: ViewMode,
      layout: ViewLayout,
    ): boolean {
      return token.generation === latestGeneration
        && token.selectionGeneration === selectionGeneration()
        && token.documentId === selectedId
        && token.revision === revisionOf(token.documentId)
        && token.view === view
        && token.layout === layout;
    },
  };
}
