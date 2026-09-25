// Is the chat surface in front of the user right now? One predicate plus the
// event announcing it turned true — nothing else.
//
// This lives apart from `surface.ts` on purpose. The hub workspace switcher
// (`shell/hub-nav.ts`) reads this to decide when to acknowledge a workspace's
// finished work as viewed, and it must not pull the desktop chat panel's
// state and storage into its load graph: `surface.ts` reads the persisted
// panel preference in its module body, which touches localStorage and
// memoizes the app base path at import time. Keeping the predicate in a
// module with no imports and no side effects keeps that cost out of every
// consumer that only wants to know whether chat is visible.

// Whether the user can see the chat right now: the page is visible and the
// chat is the surface in front — the panel open on desktop, the Chat tab
// active in touch mode, or a notification tap that is revealing it. Read
// from the attributes on <html> rather than from the panel module's state so
// a consumer outside chat (the hub switcher's viewed acknowledgement) and
// chat's own attention logic agree by construction. Dispatched on
// `document` as CHAT_SURFACE_ACTIVE_EVENT each time it turns true.
export function chatSurfaceInView(doc: Document = document): boolean {
  if (doc.visibilityState === "hidden") return false;
  const root = doc.documentElement;
  if (root.hasAttribute("data-notification-chat")) return true;
  return root.getAttribute("data-ui-mode") === "touch"
    ? root.getAttribute("data-active-tab") === "chat"
    : root.getAttribute("data-chat-panel") === "open";
}

export const CHAT_SURFACE_ACTIVE_EVENT = "uatu:chat-surface-active";
