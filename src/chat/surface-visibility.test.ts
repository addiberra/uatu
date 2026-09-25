import { describe, expect, test } from "bun:test";

import { CHAT_SURFACE_ACTIVE_EVENT, chatSurfaceInView } from "./surface-visibility";

// A stand-in for the page: the predicate only ever reads `visibilityState`
// and the attributes on <html>, so a bare attribute bag is the whole
// contract.
function docWith(
  attributes: Record<string, string>,
  visibilityState: DocumentVisibilityState = "visible",
): Document {
  return {
    visibilityState,
    documentElement: {
      hasAttribute: (name: string) => name in attributes,
      getAttribute: (name: string) => attributes[name] ?? null,
    },
  } as unknown as Document;
}

describe("chatSurfaceInView", () => {
  test("a hidden page is never in view", () => {
    expect(chatSurfaceInView(docWith({ "data-ui-mode": "touch", "data-active-tab": "chat" }, "hidden"))).toBe(false);
    expect(chatSurfaceInView(docWith({ "data-chat-panel": "open" }, "hidden"))).toBe(false);
  });

  test("touch mode follows the active tab", () => {
    expect(chatSurfaceInView(docWith({ "data-ui-mode": "touch", "data-active-tab": "chat" }))).toBe(true);
    expect(chatSurfaceInView(docWith({ "data-ui-mode": "touch", "data-active-tab": "preview" }))).toBe(false);
  });

  test("desktop follows the chat panel attribute", () => {
    expect(chatSurfaceInView(docWith({ "data-ui-mode": "desktop", "data-chat-panel": "open" }))).toBe(true);
    expect(chatSurfaceInView(docWith({ "data-ui-mode": "desktop", "data-chat-panel": "collapsed" }))).toBe(false);
    // No mode attribute at all is desktop's shape, not touch's.
    expect(chatSurfaceInView(docWith({ "data-chat-panel": "open" }))).toBe(true);
    expect(chatSurfaceInView(docWith({}))).toBe(false);
  });

  test("a notification reveal counts as in view whatever the layout says", () => {
    // The tap is mid-flight: the panel or tab has not caught up yet, but the
    // user is on their way to the chat.
    expect(chatSurfaceInView(docWith({ "data-notification-chat": "", "data-chat-panel": "collapsed" }))).toBe(true);
    expect(
      chatSurfaceInView(docWith({ "data-notification-chat": "", "data-ui-mode": "touch", "data-active-tab": "preview" })),
    ).toBe(true);
    // ...but not on a hidden page.
    expect(chatSurfaceInView(docWith({ "data-notification-chat": "" }, "hidden"))).toBe(false);
  });
});

describe("CHAT_SURFACE_ACTIVE_EVENT", () => {
  test("is a namespaced document event name", () => {
    // Listeners live outside chat (shell/hub-nav.ts); the literal is the
    // contract between them.
    expect(CHAT_SURFACE_ACTIVE_EVENT).toBe("uatu:chat-surface-active");
  });
});
