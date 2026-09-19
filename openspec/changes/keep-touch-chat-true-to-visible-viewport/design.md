## Context

See proposal.md — Why. Four mechanisms carry the affected behavior:

- **`ChatViewportController` (`src/chat/viewport.ts`)** is the only writer of `--chat-visual-top` / `--chat-visual-height`. In touch mode those variables position the chat surface, which `styles.css` renders as `position: fixed; top: var(--chat-visual-top); height: var(--chat-visual-height)` under `html[data-ui-mode="touch"][data-active-tab="chat"]`. The controller listens to visual-viewport `resize`/`scroll`, window `resize`, a `ResizeObserver` on the composer and the surface, and UI-mode changes. Every listener is the same bare `() => this.apply()` — no coalescing, no unchanged-value guard, no page-lifecycle listener. Its desktop twin `src/shell/desktop-viewport.ts` already has both guards in `measure()`.
- **`chatViewportMetrics(visualHeight, visualTop, layoutHeight, tabBarInset)`** computes `occluded = layoutHeight − visualTop − visualHeight`, uses it to shrink the tab-bar inset, and reuses it as the keyboard predicate against `max(80, tabBarInset)`. `data-chat-keyboard` on `<html>` is what collapses the pinned tracks.
- **The touch chat column** is `overflow: hidden` and fixed-height. The composer is `flex: 0 0 auto`; the transcript area is the only shrinkable child. Anything that grows and is not bounded therefore pushes the composer past the bottom edge rather than being clipped itself.
- **`CoordinatedScrollOwner` (`src/chat/coordinated-scroll.ts`)** is, by its own comment, the only automatic position writer. `pause()` unpins and re-captures at the topmost visible item; `beforeMutation(preferredItemId?)` exists so a caller can name the item the correction must hold. `keyDown` already excludes `input, textarea, select, [contenteditable=true]`; `touchStart`/`touchMove` do not.

Constraints that bound this work:

- `src/shell/tab-bar.ts` and the keyboard tab-bar rules around `styles.css` ~8020–8045 are being rewritten by draft PR #358, which makes `tabBarBottomInset()` return 0. Do not touch either; prefer tests that pass `tabBarInset = 0` so they survive that merge.
- `data-chat-editing` MUST NOT become a CSS trigger for collapsing the pinned tracks. It is used here only as a signal inside the controller for suppressing a correction.
- iOS is the subject. Two of the mechanisms can only be confirmed on a device (see Risks).

## Goals / Non-Goals

**Goals:**

- One measurement path that is idempotent, frame-coalesced, and re-entrancy-safe, so applying geometry never costs a scroll write.
- Geometry that is re-derived on page-lifecycle transitions, not only on platform viewport events.
- A keyboard predicate that does not depend on how the platform chose to make room for the keyboard.
- Position corrections that are owned by the element the user is interacting with, not by whatever happens to be topmost.

**Non-Goals:**

- Any change to the tab bar, its keyboard rules, or `tabBarBottomInset()` (#358 owns them).
- The same page-lifecycle blind spot in `src/shell/desktop-viewport.ts` and the terminal panel's `viewportSizer` — real, but out of scope; recorded as a follow-up.
- Auto-hiding the outstanding-requests pill while its target card is on screen — a behavior change beyond these three issues; recorded as a follow-up.
- Rewriting the anchor model, the pinned-track markup, or the question form's structure.

## Decisions

**D1 — A foreground resync, applied three times.**
Add a `resync` handler bound to `document` `visibilitychange`, window `pageshow`, and window `focus`. It calls `apply()` immediately, again on the next animation frame, and once more after a short settle timeout, cancelling any resync still outstanding. Three passes because the failure is a missing notification, not a late one: iOS restores the page with the keyboard already dismissed and fires no visual-viewport `resize`, and the values it reports at the moment of the transition are not yet the values it will report a frame or two later. The unchanged-value guard from D4 makes the extra passes free when nothing moved.
*Alternative:* poll the visual viewport while the tab is visible — rejected: a permanent timer for a transition that happens a handful of times per session.

**D2 — Suppressed corrections are replayed, not dropped.**
`apply()` already withholds `requestCorrection()` while `document.visibilityState === "hidden"`. Record that a correction was withheld and replay it on the first apply that finds the page visible, then clear the flag. One flag, not a queue: corrections are idempotent requests for the coordinated owner to re-run, so replaying once is equivalent to replaying each.

**D3 — Keyboard detection uses the layout/visual height difference.**
`keyboardVisible = (layoutHeight − visualHeight) > max(80, tabBarInset)`. `occluded` keeps its existing role in `tabInset` unchanged. The pan offset tells us where the visible viewport sits, which matters for the inset; it tells us nothing about whether a keyboard exists. On the reported iPhone geometry (layout 844, visual 508, pan 266, tab bar hidden) the old predicate saw 70px and dropped `data-chat-keyboard` while the keyboard was up; the new one sees 336px. The existing unit assertions are all cases where `visualTop` is 0 or the tab bar is present, so they hold unchanged.
*Alternative:* lower the 80px threshold — rejected: the threshold exists to keep accessory bars and URL-bar collapse from being read as keyboards, and the pan can be arbitrarily large.

**D4 — One frame, and no write when nothing changed.**
Coalesce every listener into a single `requestAnimationFrame`-scheduled apply, cache the last written height and top, and skip `setProperty` when the value is unchanged. This closes the re-entrant loop directly: the controller observes the surface it resizes, so a write that changes nothing must produce no ResizeObserver callback with new values, and a write that does change something is one write per frame rather than one per pan event.

**D5 — While editing, a pan alone does not request a correction.**
When `html[data-chat-editing]` is set and only `visualTop` changed between applies, write the geometry but do not call `requestCorrection()`. A caret-tracking pan is the platform moving the window over an unchanged document; the reader did not ask for a new position. Height changes still request a correction while editing, because those genuinely resize the transcript. `data-chat-editing` is read here only as controller state — per the constraint it is not used as a CSS trigger.

**D6 — The question card claims the anchor before focus.**
The question `change` handler in `src/chat/ui.ts` calls `syncQuestionControl(input, true)`, which un-hides and focuses the custom editor. Call the coordinated owner's `beforeMutation(<card's `data-chat-item-id`>)` before that, so the pending correction holds the card being answered instead of the topmost visible item. This reuses the existing `preferredItemId` seam — the same one `ui.ts` already uses when expanding a `<details>` — rather than adding a new suppression path around focus. Pairs with D7: the touch fix stops the gesture from unpinning, the anchor hand-off makes the resulting correction land on the right card.

**D7 — Touch handlers exclude text controls, as the key handler already does.**
`touchStart` and `touchMove` gain the same `closest("input, textarea, select, [contenteditable=true]")` exclusion `keyDown` applies. A touch inside a text control is a caret placement or a selection drag, not a request to scroll the conversation, and `pause()` unpins and re-anchors.

**D8 — The pill's clearance is reserved by the timeline, in CSS only.**
`.chat-transcript-area:has(> #chat-requests-jump:not([hidden])) .chat-timeline { padding-bottom: 3.5rem; scroll-padding-bottom: 3.5rem; }`, placed beside the existing `.chat-latest:not([hidden]) + .chat-requests-jump` offset rule. `:has()` is already used in this stylesheet. The `scroll-padding-bottom` matters as much as the padding: scrolling a request into view must not park it under the pill either. Reserving space rather than moving the pill keeps the pill where it is documented to be — pinned at the right edge so the count cannot scroll away.
*Alternative:* make the pill part of the flow — rejected: it would push the composer in exactly the layout that has no room for it.

**D9 — The background-task list joins the pinned-track budget.**
`#chat-background-tasks-items` is added to the `max-height: 8.5rem; overflow-y: auto` cap and to the `html[data-chat-keyboard]` hide rule, alongside the task list and subagent list. It is a pinned track by construction and was simply missed; leaving it out means a track that can grow without bound in a column whose only shrinkable child is the transcript.

## Risks / Trade-offs

- [The two iOS mechanisms are hypotheses that browser tests cannot confirm — that iOS suppresses the visual-viewport `resize` across a background transition, and that the fixed-top surface and the pan form a feedback loop] → the e2e tests fake `visualViewport` and drive the exact event sequences, which proves the code responds correctly to that sequence; only the manual iPhone Safari and installed-PWA checklist confirms the sequence is the one iOS produces. Both are flagged in tasks.md as device-only.
- [A third apply on a settle timer could fight a user gesture that started in between] → the unchanged-value guard means it writes only if the geometry actually differs, and the resync is cancelled and rescheduled by any later transition.
- [Suppressing the correction on an editing-time pan could strand the reader if a height change is delivered as pan-only] → the suppression is scoped to applies where the height is identical to the last one; any height movement still corrects.
- [Hiding the background-task list while the keyboard is up removes visible state] → identical to the treatment the task list and subagent list already receive, and the track's summary line remains.
- [`:has()` support] → already relied on elsewhere in this stylesheet, including in the touch keyboard rules; no new baseline.
- [D3 changes a predicate other rules depend on] → `data-chat-keyboard` gates the pinned-track hide rules and the tab-bar rules #358 is rewriting. Making the predicate fire in a case where it previously did not is the fix; tests pin `tabBarInset = 0` so they do not encode the inset behavior #358 removes.

## Migration Plan

None — no stored state, no protocol, no configuration. All three issues reproduce in `v0.7.0`, so per the repository's release-note discipline the PR keeps its visible `fix(chat)` title and carries no Release Please override. Rollback is a revert of the change.

## Open Questions

- The settle delay in D1 is chosen to cover iOS's post-restore reflow; the exact value can be tuned from the device checklist without changing the specs, the approach, or the task breakdown.
