# Proposal

## Why

Independent review of [#559](https://github.com/tjakobsson/uatu/pull/559) reproduced a remaining history-recovery defect: launcher content ordered newer / older / newer-alias produces four rows instead of two explicitly completed occurrences. The older launch invalidates the newer occurrence before its alias can join it.

## What Changes

- Preserve independently proven historical execution intervals during supersession, without reordering parent tools.
- Preserve uncertainty when permission-delayed tool admission spans a child boundary; a pre-admission call clock alone cannot identify a worker generation or let an earlier result complete later work.
- Keep failed-inventory targets unverified across transcript-only reads, while allowing fresh successful inventory recovery and retaining healthy sibling controls.
- Add provider regressions for interleaved intervals and pending completion reports, plus conservative missing-evidence and stale-result cases.
- Document the accepted one-time planning-order deviation for the initial correction and the prospective chronology of subsequent corrections.
- Repeat independent standards and spec reviews, correcting actionable findings until a fresh round is clear.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Existing `opencode-chat` lifecycle, notification-correlation and recovery requirements already require one settled result per confirmed occurrence and conservative uncertainty when correlation cannot be proved. This is an implementation correction; `skip_specs: true` avoids inventing a normative contract change.

## Impact

- `src/chat/opencode/v2/background.ts`, `provider.ts`, colocated provider/control tests, affected architecture notes, and the two earlier archived correction records.
- No API, dependency, configuration, stored-data, frontend-layout or live-service changes. Both running hubs remain untouched.
- No unrelated baseline-test fixes or expansion into notification-first multi-alias histories whose production reachability remains unestablished.
