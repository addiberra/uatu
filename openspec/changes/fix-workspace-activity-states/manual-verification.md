# Manual verification against a real Claude Code session

Task 6.2, 2026-09-23: first pass 21:45–22:07 local, **scenario C re-run
22:37–22:46 after its defects were fixed**. Not an e2e fake — a real Claude
Code agent, real background work, real hub. A, B and D are the first pass's
findings and still stand; C is the re-run.

## What was run

- Uatu from this worktree at `7219998` + working tree, started as
  `bun run src/cli.ts hub --config /tmp/uatu-verify/hub.json` on port 4791
  (`bun run dev`'s 4702 was held by a dev hub from the main checkout; the
  throwaway config is `dev/hub.json`'s shape, user `dev`/`dev`, state under
  `/tmp/uatu-verify/state`).
- Two workspaces: `watch-docs` (= `testdata/watch-docs`, "A") and `uatu-ws-b`
  (= a scratch git repo at `/private/tmp/uatu-ws-b`, "B").
- Agent: Claude Code, `@anthropic-ai/claude-agent-sdk` 0.3.261 (bundled CLI
  2.1.261). Model **Haiku 4.5** throughout. Auth from the local Claude Code
  login worked in both passes; no auth problems.
- Driver: throwaway Playwright 1.63.0 / Bun 1.4.2 scripts in `/tmp/uatu-verify/`
  (`lib.ts` + `phase*.ts`; the re-run adds `recheck-lib.ts` and
  `recheck{1..5}.ts`, screenshots `recheck-*.png`); headless Chromium, real
  clicks. Permission cards were answered by clicking `Allow once` /
  `Allow always`.
- Re-run note: sessions do not survive a hub restart — each workspace needed
  `POST /api/hub/sessions/<id>/start` first (a bare page load answers 503).

## A — a backgrounded shell command is listed mid-turn; the composer keeps working

**Verified.** Prompt: the `for i in 1..10; do echo tick-$i; sleep 3; done`
background command from the spike.

- 6 s in, with the turn still `working`, `#chat-background-tasks` was unhidden
  (label `1 background task running · for i in 1 2 … done`), one
  `li[data-background-task="bik3yid6n"]` with a
  `button.chat-background-task-inspect[data-inspect-view="output"]` and
  `[data-stop-task]`; `#chat-input` was not disabled. (`A1-task-listed.png`)
- With the turn over (agent answered `STARTED`) and only the command live, the
  composer status was `background` and still accepted a prompt.
  (`A2-background-state.png`)
- On settle the row left the list, the timeline gained `Background task
  finished` + the command, then the agent's own follow-up turn ("… exit code
  0"). (`A3-timeline.png`)

## B — the output view shows real interim output and Stop works

**Verified.**

- The row's inspect button opened `#chat-drilldown` with the timeline hidden and
  `#chat-drilldown-output` shown;
  `#chat-drilldown-task[data-task-id="bik3yid6n"][data-task-state="running"]`
  carried the command, Stop and a ticking clock (0:02 → … → 0:27).
  `#chat-drilldown-output-text` held real output and grew while it ran,
  `tick-1` → `tick-1..3` → … → `tick-1..10`, then `\n[exited with code 0]\n`
  once the strip flipped to `data-task-state="settled"`.
  (`B1-output-view-open.png`, `B2-output-growing.png`, `B3-output-later.png`)
- Stop (separate run, 60 iterations): `[data-stop-task]` became `Stopping…`;
  within 1 s the strip read `stopped · …`, the output ended `tick-3\n\n[killed]`,
  the row left the list and the timeline gained `Background task stopped`.
  (`B4-before-stop.png`, `B5-after-stop.png`, `B6-timeline-stopped.png`)

## C — subagents and shell tasks while they run (re-run, after the fixes)

**Verified.** Four fresh Claude Code conversations on Haiku 4.5; every
observation is from a live run, not a replay.

- **C1 — a backgrounded subagent reads as running, with its progress note**
  (`recheck1.ts`). While the task was live the track read `1 of 1 subagent
  working · Read and summarize four repository files`, the row was
  `class="is-running"` with `.chat-subagent-progress` = `Using Read` and
  `data-open-conversation="claude:sub:<sessionId>:<agentId>"`; on settle it
  flipped to `1 subagent finished` / `is-completed`.
  (`recheck-C1-track-running.png`, `recheck-C1-track-final.png`)
- **C2 — a foreground subagent is openable while running, from both places**
  (`recheck2.ts`, `recheck3.ts`). The track row carried
  `data-open-conversation` from the first poll that showed it (5 s in) and kept
  it for the whole ~27 s run. The `Agent` tool row's `Open transcript` button
  (same child id) was present 7 s in, while the row's own status still read
  `running` — but only after expanding its collapsed group and the row itself,
  whose body is deferred while closed.
  (`recheck-C2-track-running-openable.png`,
  `recheck-C2b-timeline-open-transcript.png`)
- **C3 — the opened child transcript fills in live, through settle**
  (`recheck4.ts`, `Read` pre-approved with `Allow always` so the child was not
  blocked). Opened from the launching row while running, `#chat-drilldown-items`
  went 2 items / 100 chars → 4 → 5 / 900, ending with the subagent's own
  four-file summary, **with no reload**; the track flipped to `1 subagent
  finished` while the transcript stayed open, and on return the launching row
  read `Agent … completed` and still offered `Open transcript`.
  (`recheck-C2c-child-open.png`, `recheck-C2c-child-settled.png`,
  `recheck-C2c-row-after.png`)
- **C4 — a shell task's composer row ticks** (`recheck5.ts`).
  `li[data-background-task="bip30m6t3"]` carried
  `.chat-background-task-elapsed[data-elapsed-since]` reading `0:00`, then
  `0:03, 0:06 … 0:27` across ten polls; when the command settled the row left
  the list, `#chat-background-tasks` went hidden and its label emptied.
  (`recheck-C3-elapsed-first.png`, `recheck-C3-elapsed-ticking.png`,
  `recheck-C3-after-settle.png`)
- First pass, still valid: the backgrounded `Agent` is listed within 6 s, mid
  turn (`data-inspect-view="transcript"`, task id = agent id, as D8 expects),
  and its drill-down strip shows `general-purpose`, a ticking clock, `Using
  Read`, `17k tokens · 3 tool uses` and Stop. (`C1-agent-task-listed.png`)
- Side observation (not a defect): the subagent's `Read` permissions land in the
  parent timeline, hidden behind an open drill-down — in the re-run that stalled
  an open child transcript for ~40 s until the cards were answered.

## D — the hub switcher: working → finished → cleared

**Verified.** A ran the background command; B's page (same login, second tab)
was watched. A's chat panel was collapsed while the work ran, so A did not
report the chat surface in view.

- Baseline: B's menu row for `watch-docs` carried no state word, chip hidden.
- With A's turn over and only the shell task live, B's row read
  `.hub-menu-state.is-working` "working" and the chip
  `.hub-activity-badge.is-working` for ~48 s — **issue #388 fixed**.
  (`D2-B-working.png`)
- When the command and the follow-up turn ended, B flipped to
  `.hub-menu-state.is-finished` and `.hub-activity-badge.is-finished` count `1`
  — **issue #383's missing state**. (`D3-B-finished.png`)
- Re-opening A's chat panel cleared both on B within the first 2 s poll, with no
  reload of either page. (`D4-A-chat-back.png`, `D5-B-cleared.png`)
- Wire shape checked on `/api/hub/live?ws=…&activity=1`:
  `{"running":true,"working":…,"awaiting":…,"finished":…}`.

## Resolved — re-observed fixed against a real agent

1. **A running backgrounded subagent announced as finished** — reads running,
   with its progress note, until it settles (C1).
2. **A running foreground subagent could not be opened** — openable while
   running from the track row *and* the launching timeline row, and the child
   transcript follows it live through settle (C2, C3). The spec scenario "A
   running subagent is opened and followed … from its row or the subagents
   track" is now met for both kinds of run.
3. **A shell task's row carried no elapsed readout** — present, ticking, and it
   stops with the row (C4).
4. Cosmetic (first-pass defect 5): `#chat-background-tasks-label` no longer
   keeps stale text — at settle the list was hidden with an empty label.

## Open defects and surprises

1. **The tracks are collapsed `<details>`.** `#chat-background-tasks` and
   `#chat-subagents` show their label but hide their rows — and the inspect,
   open and Stop controls — until the summary is clicked; the launching timeline
   row costs two more clicks (its group, then the row, whose body is deferred
   while closed) before `Open transcript` exists in the DOM at all. Everything
   works after those clicks.
2. **A settled `Agent` row shows the raw result envelope** — `[ { "type":
   "text", "text": "Here are summaries of four files…" } ]` instead of the prose
   `renderSubagentResult` intends (`recheck-C2c-row-after.png`). Pre-existing:
   the Claude tool-result text path and `src/chat/tool-detail.ts` are untouched
   by this change.
3. After a task is stopped the composer status stayed `background` for a moment
   with zero rows (first pass, not re-exercised).
4. Harness note, not a product defect: a permission left unanswered in *any*
   conversation keeps the workspace `awaiting` forever, correctly suppressing
   `finished`. The first D run was invalidated by exactly that.

## Not covered and why

- `/code-review` and other skill forks — the spike established they produce no
  task frames at default levels, so there is nothing for this change to show.
- The two-user rule for `finished` — only the single `dev` user exists here.
- Monitors, touch mode, `finished` surviving a page close, output truncation
  (`#chat-drilldown-output-note` never fired at these sizes), Hub dashboard.
- Tab-visibility-driven "chat not in view": headless and headed Chromium both
  report every tab `visible`, so the collapsed chat panel was used instead —
  the same `chatSurfaceInView()` predicate, a different one of its inputs.
