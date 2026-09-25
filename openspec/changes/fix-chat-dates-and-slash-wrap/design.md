## Context

See proposal.md for why. This section covers only the state the approach
depends on.

**Reset formatting today.** `src/chat/composer-status.ts` already has the two
helpers the plan rows use: `resetClock(resetsAt, now)` gives a bare
`HH:MM` when the reset is under 24 hours away and `"<short weekday> HH:MM"`
otherwise; `relativeReset(resetsAt, now)` gives `"in 4d 11h"` /
`"in 2h 05m"` / `"in 35m"` / `"now"`. `planReadoutRows` combines them as
`resets Sat 21:00 · in 4d 11h`. The rate-limit standing does not use them.
It formats `new Date(resetsAt).toLocaleTimeString([], { hour, minute })`
inline in four places:

- `src/chat/ui.ts` ~2048: the readout's standing line
  (`${standing.message} Resets 23:00.`). This is the line in issue #429.
- `src/chat/ui.ts` ~2171: the `rateLimitLive` assistive-technology
  announcement.
- `src/chat/composer-status.ts` `rateLimitBadgeLabel`: the chip text
  (`Near rate limit · resets 23:00`).
- `src/chat/timeline-renderer.ts` ~997: the generic `notice` renderer. Rate-limit
  standings are filtered from the timeline (`isRateLimitStanding`), so this
  path is mostly unreached, but it is the same inline pattern.

The standing message itself comes from `src/chat/claude/normalization.ts`
~440 (`Approaching your ${kind} rate limit${utilization}.`) and carries
`resetsAt` as epoch ms. Formatting stays on the client, in the reader's
zone, as the existing comment in the notice renderer requires.

**Timestamps in the timeline.** Every `ConversationItem` has
`createdAt: number` (epoch ms, `src/chat/types.ts`). Its source per agent:

- Claude Code: `envelopeIdentity` in `src/chat/claude/normalization.ts`
  parses the SDK/transcript record's `timestamp`. On replay, records come
  from the native JSONL transcript (`src/chat/claude/transcript.ts`, which
  parses `record.timestamp`), so history keeps its real times. Live stream
  messages without a timestamp fall back to `Date.now()`. Accepted user
  prompts use the accept time (`provider.ts` ~813).
- OpenCode: v1 and v2 normalization take `info.time.created` /
  `part.time.created` (`timestamp(...)` in `src/chat/opencode/*`). Some
  usage-carrier paths default to `0` when the time is missing.

The renderer shows none of this today, apart from a per-item `title`
tooltip (`timestampAttribute`, `toLocaleString()`).

**Timeline assembly.** `TimelineRenderer.renderTimeline`
(`src/chat/timeline-renderer.ts`) builds a keyed node per visible item, then
assembles a top-level `ordered` list from `activitySegments(...)`. A segment
is either flat items or a group node, and accepted drafts plus the awaiting
line are appended after them. The list is reconciled into `target` with
an insert-before cursor walk. Group nodes are kept in `groupEntries`, and
stale ones are removed after the walk. The same class renders the main
timeline (`ui.ts` ~183) and the subagent drill-down (`ui.ts` ~289). Scroll
anchoring (`src/chat/anchor.ts`, geometry built in `ui.ts` ~592) measures
only `[data-chat-item-id]` elements. The scroller is `.chat-timeline`
(`overflow-y: auto`), and `#chat-items` is its content box.

**Slash menu.** `renderCommandMenu` in `src/chat/ui.ts` ~3457 renders each
suggestion as a `button.chat-command-option` grid with name, hint, and
description spans. `src/styles.css` ~6962 gives `.chat-command-hint` and
`.chat-command-description` `white-space: nowrap; overflow: hidden;
text-overflow: ellipsis`. The truncation is CSS only. No provider
shortens descriptions: Claude (`provider.ts` ~2399) and OpenCode v1/v2
pass them through whole. The same menu serves both agents.

## Goals / Non-Goals

**Goals:**
- One reset formatter used by every rate-limit surface and the plan rows.
- Day separators computed entirely client-side from existing `createdAt`,
  identical for every agent and for replayed or paged history.
- Wrapping slash descriptions with a CSS-first change.

**Non-Goals:**
- No per-message time labels in the timeline. The existing hover tooltip
  stays.
- No change to how agents stamp `createdAt`. Improving the live Claude
  fallback to `Date.now()` is out of scope.
- No change to the normalized standing message text or to the wire.
- No relative-date wording beyond "Today" / "Yesterday" (no "3 days ago").

## Decisions

### D1. Reset: one `resetMoment` formatter with a calendar-day rule (#429)

Change `resetClock` to decide by the reader's **local calendar day**
instead of "under 24 hours". The rule:
- Same local day as `now`: `HH:MM`.
- 1–6 local days ahead: `<short weekday> HH:MM` (`Thu 23:00`). This is the
  existing shape, so the plan rows look the same.
- 7 or more local days ahead: `<short weekday> <day> <short month> HH:MM`
  via `toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })`.
  Without the date, the weekday would be today's weekday and could be
  read as today.
- In the past (the standing is stale): the same day rule. `relativeReset`
  already says `now`.

Add `resetMoment(resetsAt, now)` next to it, returning
`"<resetClock> · <relativeReset>"`. Then:
- Readout standing line and live announcement:
  `${message} Resets ${resetMoment}.`, for example "Approaching your 7-day
  (overage included) rate limit (81% used). Resets Thu 23:00 · in 3d 4h."
  Both call one shared `standingSentence(standing, now)` exported from
  `composer-status.ts`, which replaces the two inline copies in `ui.ts`.
- Chip (`rateLimitBadgeLabel`): `resets ${resetClock}` only. The chip is
  space-constrained, and the day is the part that removes the ambiguity.
- Timeline notice renderer: same `resetClock` + `relativeReset` for
  consistency.

Local-day comparison compares `new Date(x)` year/month/date in the local
zone. It does not use the difference in ms, so DST days (23/25 h) are
handled.

*Alternatives:* (a) Leave `resetClock`'s 24 h rule and add a day only in
the warning. Rejected: at 23:30 a reset at 06:00 tomorrow would still read
as a bare "06:00" in the rows, which is the same ambiguity. (b) "Tomorrow
06:00". Rejected: the rows already use weekdays, and the issue asks for
consistency with them. (c) `Intl.RelativeTimeFormat`. Rejected: it
disagrees with the existing `in 4d 11h` style.

### D2. Day separators: keyed top-level nodes emitted during assembly (#427)

During top-level assembly in `renderTimeline`, the renderer tracks the
local day key (`YYYY-MM-DD` in the local zone) of each top-level unit:
- a flat item uses its `createdAt`
- a group uses its first member's `createdAt`
- an accepted draft uses the render time, since a draft is being sent now
- the awaiting line uses no time and never starts a day

When a unit's day differs from the previous unit's day, including the
first unit, the renderer pushes a separator node before it. A time counts
as unknown when it is non-finite or earlier than `1e12` ms
(2001-09-09): missing times arrive as `0`, and anything that early is a
placeholder or a seconds-for-milliseconds slip. Dating that content
"1 January 1970" would be wrong. An unknown-time unit inherits the previous
day and never starts a separator.

- Separators are kept in a `dayEntries: Map<dayKey, HTMLElement>` and
  reconciled exactly like `groupEntries`: reuse by key, remove stale ones
  after the walk, and clear them on `reset`. A day key is unique within a
  conversation because items are ordered by conversation order (spec:
  "Timeline order follows the conversation's message order"). If clock
  skew ever makes a day recur, the second occurrence is skipped, so a
  day is never labelled twice.
- Markup:
  `<div class="chat-day-separator" data-chat-day="2026-09-25" role="separator" aria-label="Today, Friday 25 September"><time datetime="2026-09-25">Today</time></div>`.
  It has no `data-chat-item-id`, so anchoring, `[data-chat-item-id]`
  delegation, copy actions, and item find-reveal all ignore it
  automatically.
- Label: "Today" / "Yesterday" by local-day difference from `now`.
  Otherwise `toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })`,
  with `year: "numeric"` added when the year differs from `now`'s. The
  English words match the rest of the UI's copy. Dates follow the browser
  locale (`[]`), as the existing reset and tooltip code do. The time zone
  is the browser's.
- Clock injection: the renderer takes `now: () => number` (default
  `Date.now`) so unit tests control "today".
- **Day rollover:** after a render that emitted separators, the renderer
  keeps one `setTimeout` to the next local midnight (+1 s). The timer
  relabels existing `dayEntries` in place, changing text and aria-label
  only, with no re-render and no layout change beyond the label. The timer
  is cleared on `reset` and re-armed on each render. Any render also
  relabels. A tab that sleeps past midnight gets a late timer or the next
  render, both of which correct the labels.

**Sticky vs. static separators.** Separators get
`position: sticky; top: 0` inside the `.chat-timeline` scroller. All
separators are siblings in `#chat-items` and share one containing block, so
every separator already passed stays pinned. For that reason the separator
row is a full-width opaque `var(--surface)` band, whose upward box-shadow
also covers the scroller's top padding. The newest pinned separator then
paints over the earlier ones entirely, and a wider earlier pill cannot peek
out behind it. This gives the "which day am I reading" context
the issue asks for without a scroll listener or an extra floating element.
The main timeline and the drill-down both get it, since both scroll
`.chat-timeline`-like containers. The implementer must check the scroller's
existing top padding/inset, which the header notes at `styles.css` ~437
describe for the preview. The drill-down needs the same check.

*Alternatives considered:*
- A floating "current day" chip driven by scroll position: more code, and
  it would need to cooperate with `coordinated-scroll`/anchor restore.
  Rejected.
- Static separators only: they lose context while scrolling back inside a
  long day, which is the case the issue calls out. Rejected.
- Separators rendered as `ConversationItem`s in the projection: that would
  leak presentation into the shared model, touch grouping and anchoring,
  and need new item types. Rejected.
- Separators only where the day changes (none above the first message):
  a conversation reopened from last week would then show no date at all.
  Rejected. The spec requires one above the first day.

### D3. Slash descriptions always wrap in full (#424)

This is a CSS-only change in `src/styles.css`, based on the user's
decision: always wrap fully, with no clamp.
- `.chat-command-hint, .chat-command-description`: remove `nowrap`,
  `overflow: hidden` and `text-overflow: ellipsis`. Add `white-space:
  normal; overflow-wrap: anywhere` so long unbroken paths and URLs also
  wrap.
- The grid's first column is `minmax(max-content, auto)`, which lets a very
  long command name force horizontal overflow on a narrow touch panel.
  Change it to `minmax(0, max-content)` and give the name
  `overflow-wrap: anywhere`.
- Keyboard highlight: the existing
  `scrollIntoView({ block: "nearest" })` on the active option already
  keeps a tall highlighted option in view inside the scrolling menu
  (`max-height: min(22rem, 48vh)`). The e2e test covers it.

*Alternative considered:* clamp non-highlighted descriptions to three lines
and show the full text only for the highlighted suggestion. This was
rejected by the user decision: every description is visible without
navigating. The trade-off is that large skill catalogs with very long
descriptions show fewer suggestions per screen, and the menu scrolls.

## Risks / Trade-offs

- [Existing renderer tests assert exact top-level children, and fixtures
  use tiny epochs like `createdAt: 1`] → Those epochs count as unknown
  times, so no separator appears. The exception is an accepted draft, which
  is dated now and opens a "Today" separator. The three draft-ordering
  assertions look past separators. The e2e order check in
  `chat-claude-polish.e2e.ts:167` already selects `[data-chat-item-id]`.
- [A sticky separator may overlap the first line of content, or the
  jump-to-latest / requests pill] → Give the separator a compact height
  and an opaque background, and verify in both desktop split and touch
  layouts in e2e screenshots.
- [Find-in-surface would match "Today" / weekday text] → Acceptable, since
  the text is visible. The separator is not an item, so reveal logic is
  unaffected.
- [Clock skew between agent and client, or items with a fallback
  `Date.now()`, could put a live item on a different day than its
  neighbours] → The separator reflects what the item claims. Skipping a
  recurring day key prevents duplicate labels.
- [Very long skill descriptions make each suggestion tall] → The menu is
  height-capped and scrolls, and the highlighted suggestion is scrolled
  into view. This was accepted by the user decision.
- [The calendar-day rule changes the plan rows for resets 0–24 h away that
  fall tomorrow] → This is intended, and the spec scenario covers it.
  Update `composer-status.test.ts` expectations.

## Migration Plan

Client-only. No data, wire, or config migration. Rollback is a revert.

## Open Questions

None.
