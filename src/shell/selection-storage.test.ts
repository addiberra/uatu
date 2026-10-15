import { expect, test } from "bun:test";
import { presentationStorage } from "./presentation-storage";
import { DOCUMENT_SELECTION_CLEARED_KEY, readSelectionCleared, writeSelectionCleared } from "./selection-storage";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null,
    key: index => [...entries.keys()][index] ?? null,
    removeItem: key => { entries.delete(key); },
    setItem: (key, value) => { entries.set(key, value); },
  };
}

test("only an explicit true marker restores intentional emptiness; old/invalid values retain defaults", () => {
  const storage = memoryStorage();
  expect(readSelectionCleared(storage)).toBe(false);
  for (const value of ["false", "1", "null", "", "{}", "TRUE"]) {
    storage.setItem(DOCUMENT_SELECTION_CLEARED_KEY, value);
    expect(readSelectionCleared(storage)).toBe(false);
  }
  writeSelectionCleared(true, storage);
  expect(readSelectionCleared(storage)).toBe(true);
  writeSelectionCleared(false, storage);
  expect(storage.getItem(DOCUMENT_SELECTION_CLEARED_KEY)).toBeNull();
});

test("reload shares the workspace marker without leaking to other base paths", () => {
  const raw = memoryStorage();
  writeSelectionCleared(true, presentationStorage(raw, "/s/alpha/"));
  expect(readSelectionCleared(presentationStorage(raw, "/s/alpha/"))).toBe(true);
  expect(readSelectionCleared(presentationStorage(raw, "/s/beta/"))).toBe(false);
  expect(readSelectionCleared(presentationStorage(raw, "/"))).toBe(false);
  writeSelectionCleared(false, presentationStorage(raw, "/s/beta/"));
  expect(readSelectionCleared(presentationStorage(raw, "/s/alpha/"))).toBe(true);
  expect(raw.getItem(`uatu:presentation:v1:${encodeURIComponent("/s/alpha/")}:${DOCUMENT_SELECTION_CLEARED_KEY}`)).toBe("true");
});

test("unavailable, denied, or full browser storage degrades gracefully", () => {
  const blocked = memoryStorage();
  blocked.getItem = blocked.setItem = blocked.removeItem = () => { throw new Error("blocked"); };
  expect(readSelectionCleared(blocked)).toBe(false);
  expect(() => writeSelectionCleared(true, blocked)).not.toThrow();
  expect(() => writeSelectionCleared(false, blocked)).not.toThrow();
  expect(readSelectionCleared(null)).toBe(false);
  expect(() => writeSelectionCleared(true, null)).not.toThrow();
});
