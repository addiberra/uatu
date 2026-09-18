import { presentationLocalStorage } from "./presentation-storage";

export const DOCUMENT_SELECTION_CLEARED_KEY = "uatu:document-selection-cleared";

// Browser-local intent, scoped by the same session base path as presentation
// preferences. Other tabs share storage, but no storage listener changes an
// already-open tab's active selection.
export function readSelectionCleared(storage = presentationLocalStorage()): boolean {
  try {
    return storage?.getItem(DOCUMENT_SELECTION_CLEARED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSelectionCleared(cleared: boolean, storage = presentationLocalStorage()): void {
  try {
    if (cleared) storage?.setItem(DOCUMENT_SELECTION_CLEARED_KEY, "true");
    else storage?.removeItem(DOCUMENT_SELECTION_CLEARED_KEY);
  } catch {
    // Storage may be denied or full; this tab's runtime intent still works.
  }
}
