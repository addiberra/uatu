# OpenCode chat screenshots

The feature's 15 historical screenshots belong in the [PR #519 description](https://github.com/tjakobsson/uatu/pull/519), not as tracked repository PNGs. The capture notes and caption index below describe those original frames; new captures are local test artifacts for review and optional PR attachment, not replacements for the historical evidence.

Current acceptance: **user-reported iPhone acceptance**; the user owns physical-device testing. No agent physical-device test is claimed. Focused Chromium and WebKit header/focus regressions now pass; this is not a full WebKit-suite acceptance claim, and these older Chromium gallery captures are not WebKit evidence.

Actual application captures in Chromium, light/dark themes: desktop **1440 × 1000 CSS pixels**, mobile **390 × 844**. These are synthetic documentation fixtures, not personal conversations, provider benchmarks, native iPhone captures, or evidence of live-model acceptance. No paid generation or live Hub was used. The nine frames containing workers use `2812932` plus the worker-effort/session-cost refinement. Unaffected overview, configuration, mobile side-answer and isolated Hub frames are retained from the preceding gallery capture.

These frames predate the compact touch New conversation button and fixed keyboard shortcuts. See [current chat behavior](../../CHAT.md); the gallery has not been regenerated for those refinements.

The standard workspace contains only the E2E sample README/files. Model names, context figures, jobs, questions and answers are scripted. The preferences capture uses an isolated test Hub/account with an empty credential store. No authentication URLs, credentials, private filesystem paths, real costs, or original user photographs are included.

| Capture | What to look for |
| --- | --- |
| Overview, light | Idle composer, selected fixture model, draft and 32% context occupancy. |
| Configuration, light | Model, mode and Medium reasoning selection in the real picker. |
| Workers, dark | Aligned agent, task, model + last-used effort, cumulative tokens and session USD cost; independent 28px Stop and Inspect targets. Scripted medium/high, zero and sub-cent values are not real charges. Narrow panes wrap metadata minimally. |
| Expanded queue and workers, light | Twenty jobs plus twenty pending entries; independent scrollports and headers, 32px pending actions and a useful 200–280px preferred desktop reading band. |
| Hold at 1.0 seconds, dark | After 500ms silent arming, 0.5s into the countdown: the full envelope is already 104px above unchanged Send. |
| Hold at 2.1 seconds, dark | Identical outer bounds, increased green fill; 0.4 seconds remain before the 2500ms queue deadline. Raw frames, not a fabricated animation. |
| Worker inspection, dark | Child transcript, Back and scoped Stop worker, while the parent worker overview remains. |
| Question with running work, light | An unanswered choice remains actionable while an independent worker runs; the composer draft is retained. |
| Side answer ready, dark | `/btw` completion stays at the transcript edge, outside the composer. |
| Formatted side reader, dark | Larger nonmodal reading window, real sanitized Markdown and workspace reference; composer/workers remain interactive, Minimise retains the answer. |
| Personal preferences, light | Account-level automatic-background preference and its explanation, in an isolated synthetic Hub. |
| Unknown receipt, dark | Lost native acknowledgement remains unconfirmed, with explicit “Do not repeat” feedback rather than a retry. |
| Replacement warning, light | Reverted history, paused-steer batch action, count-only replacement warning and distinct pending delivery badges. |
| Mobile side reader, light | Existing mobile modal with the same accessible Minimise action. |
| Mobile minimised answer, light | Unblocked conversation and composer; the existing notice reopens the retained answer without inference. |

Overview/configuration/question use the scripted chat-service fixture so all model metadata can be selected without inference. The other chat captures run the production adapter/provider against the local scripted OpenCode 2.x HTTP server. Side-reader responses use deterministic Markdown (the desktop request completes against the native fixture first; mobile is browser-stubbed). Desktop gallery widens the actual chat split to demonstrate its container-based single-line density. Screenshots show rendered application states, not mock HTML.

Worker effort is OpenCode execution-reported metadata, not a downstream-provider
behavior guarantee or the parent's configured reasoning choice. A dash has an
accessible “not reported” label. Cost uses the child's authoritative native
`SessionInfo.cost` / `session.usage.updated.cost` cumulative USD snapshots, including
compaction and reverted spend, not latest-call prices or message sums. Parent and
descendant totals are not added. Reported zero remains zero; missing aggregate data
remains unknown. Current Claude and OpenCode 1.x integrations leave effort/session
cost unreported rather than guessing from configuration, message prices or models.

## Capture local artifacts

No gallery regeneration is needed for the PR migration: transfer the original 15 PNGs unchanged, with the historical disclosures above. When new captures are explicitly requested, use the repository's existing dependencies and Playwright browsers:

```sh
UATU_CAPTURE_CHAT_SCREENSHOTS=1 bunx playwright test \
  tests/e2e/chat-screenshots.e2e.ts tests/e2e/chat-screenshots-hub.e2e.ts \
  --project=e2e --workers=1
```

Captures use Playwright's per-test `test-results/` output paths and PNG report attachments through `tests/e2e/evidence.ts`. These outputs are ignored by Git; the tests do not write to this documentation directory. Leave `UATU_E2E_SCREENSHOTS_DIR` unset for local-only output (the shared evidence helper can otherwise copy captures to an explicitly chosen evidence folder).

To select only the two hold frames from the desktop gallery writer:

```sh
UATU_CAPTURE_CHAT_SCREENSHOTS=1 UATU_CAPTURE_HOLD_ONLY=1 bunx playwright test \
  tests/e2e/chat-screenshots.e2e.ts --project=e2e --workers=1 --grep 'desktop documentation gallery'
```

Normal tests skip these writers. Review image privacy and captions before publication. Capture helpers assert the key rendered states; the gallery itself is not independent validation. Hold/queue regressions live in `tests/e2e/chat-hold-queue-regressions.e2e.ts`; the reference-workdock suite covers normal/short/mobile/enlarged-text layouts and independent scrolling. Nonzero viewport/fixed-origin checks are synthetic. Physical iPhone testing is user-owned, with user-reported acceptance as noted above; no agent native-device result is claimed. The earlier WebKit initial-tab runtime blocker is resolved; current focused checks remain separate from these captures.

To select only the nine frames containing worker metadata from the desktop gallery writer:

```sh
UATU_CAPTURE_CHAT_SCREENSHOTS=1 UATU_CAPTURE_WORKERS_ONLY=1 bunx playwright test \
  tests/e2e/chat-screenshots.e2e.ts --project=e2e --workers=1 --grep 'desktop documentation gallery'
```

The selection flags filter the named gallery frames; the existing supplementary `desktop-side-reader-light` report attachment is still produced. The mobile test also attaches `mobile-side-reader-dark` when included in the run. Neither supplementary attachment is part of the original 15-frame gallery.
