import { afterEach, expect, test } from "bun:test";
import { dispatchMobileHistory, installMobileHistory, onWorkspaceForegroundChange, readWorkspaceHistory, setWorkspaceForeground, workspaceForeground, workspaceLocation, writeMobileHistory } from "./coordinator-context";

afterEach(() => setWorkspaceForeground(true));
test("standalone defaults stay active; modal and Hub presentation gate only interaction", () => {
  expect(workspaceForeground()).toBe(true);
  const seen: boolean[] = [];
  const stop = onWorkspaceForegroundChange(() => seen.push(workspaceForeground()));
  setWorkspaceForeground(false);
  setWorkspaceForeground(false);
  setWorkspaceForeground(true, true);
  expect(workspaceForeground()).toBe(false);
  setWorkspaceForeground(true);
  expect(seen).toEqual([false, false, true]);
  stop();
});
test("one optional route owner partitions before workspace history; removing it restores defaults", () => {
  const event = { state: { documentId: "a" } } as PopStateEvent;
  expect(dispatchMobileHistory(event)).toBe(false);
  const writes: unknown[] = [];
  const stop = installMobileHistory({ dispatch: value => value === event, write: (...values) => { writes.push(values); return true; } });
  try {
    expect(dispatchMobileHistory(event)).toBe(true);
    expect(() => installMobileHistory({ dispatch: () => true, write: () => true })).toThrow();
    expect(writeMobileHistory({ documentId: "a" }, "/s/a/doc.md", true)).toBe(true);
    expect(writes).toEqual([[{ documentId: "a" }, "/s/a/doc.md", true]]);
  } finally { stop(); }
  expect(dispatchMobileHistory(event)).toBe(false);
  expect(writeMobileHistory({}, "/doc.md", false)).toBe(false);
});

test("workspace URL reads and writes share their existing owner while Settings is displayed", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = new URL("https://hub.invalid/settings?detail=security");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location, history: { state: { mobileHub: { route: "settings" } } } } });
  let frame = { url: "/s/a/README.md?conversation=opencode%3Aoriginal#anchor", state: { documentId: "readme" } };
  const stop = installMobileHistory({ dispatch: () => true, read: () => frame, write(state, url) { frame = { url, state: state as typeof frame.state }; return true; } });
  try {
    expect(workspaceLocation().pathname).toBe("/s/a/README.md");
    expect(workspaceLocation().search).toBe("?conversation=opencode%3Aoriginal");
    expect(readWorkspaceHistory().state).toEqual({ documentId: "readme" });
    writeMobileHistory(readWorkspaceHistory().state, "/s/a/next.md?conversation=opencode%3Aoriginal#next", true);
    expect(workspaceLocation().hash).toBe("#next");
    expect(location.href).toBe("https://hub.invalid/settings?detail=security");
  } finally { stop(); if (saved) Object.defineProperty(globalThis, "window", saved); else Reflect.deleteProperty(globalThis, "window"); }
});
