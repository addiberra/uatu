# OpenCode chat screenshots

Actual application captures at **1440 × 1000 CSS pixels**, Chromium, light/dark themes. These are synthetic documentation fixtures, not personal conversations, provider benchmarks, native iPhone captures, or evidence of live-model acceptance. No paid generation or live Hub was used. Other frames retain source revision `01b9743` plus the hold-origin and expanded-editing fixes; the two hold frames use `a431cc8` plus this fixed-height/arming refinement.

The standard workspace contains only the E2E sample README/files. Model names, context figures, jobs, questions and answers are scripted. The preferences capture uses an isolated test Hub/account with an empty credential store. No authentication URLs, credentials, private filesystem paths, real costs, or original user photographs are included.

| Capture | What to look for |
| --- | --- |
| [Overview, light](01-overview-light.png) | Idle composer, selected fixture model, draft and 32% context occupancy. |
| [Configuration, light](01-configuration-light.png) | Model, mode and Medium reasoning selection in the real picker. |
| [Workers, dark](02-workers-dark.png) | Two active two-line rows, dense finished row, independent Stop and Inspect targets. |
| [Expanded queue and workers, light](03-expanded-queue-workers-light.png) | Twenty jobs plus twenty pending entries; separate headers/body scrollports use the remaining region, leaving a small conversation strip. |
| [Hold at 1.0 seconds, dark](04-hold-quarter-dark.png) | After 500ms silent arming, 0.5s into the countdown: the full envelope is already 104px above unchanged Send. |
| [Hold at 2.1 seconds, dark](04-hold-near-dark.png) | Identical outer bounds, increased green fill; 0.4 seconds remain before the 2500ms queue deadline. Raw frames, not a fabricated animation. |
| [Worker inspection, dark](05-worker-inspection-dark.png) | Child transcript, Back and scoped Stop worker, while the parent worker overview remains. |
| [Question with running work, light](06-question-with-workers-light.png) | An unanswered choice remains actionable while an independent worker runs; the composer draft is retained. |
| [Side answer ready, dark](07-side-answer-ready-dark.png) | `/btw` completion stays at the transcript edge, outside the composer. |
| [Formatted side reader, dark](07-side-reader-dark.png) | Real sanitized Markdown heading, table, code and workspace reference; independent workers remain visible behind it. |
| [Personal preferences, light](08-personal-preferences-light.png) | Account-level automatic-background preference and its explanation, in an isolated synthetic Hub. |
| [Unknown receipt, dark](09-unknown-receipt-dark.png) | Lost native acknowledgement remains unconfirmed, with explicit “Do not repeat” feedback rather than a retry. |
| [Replacement warning, light](09-replacement-warning-light.png) | Reverted history, paused-steer batch action, count-only replacement warning and distinct pending delivery badges. |

Overview/configuration/question use the scripted chat-service fixture so all model metadata can be selected without inference. The other chat captures run the production adapter/provider against the local scripted OpenCode 2.x HTTP server. The side-reader response is replaced with deterministic Markdown after the native fixture request completes. Screenshots show rendered application states, not mock HTML.

## Regenerate

With the repository's existing dependencies and Playwright browsers:

```sh
UATU_CAPTURE_CHAT_SCREENSHOTS=1 bunx playwright test \
  tests/e2e/chat-screenshots.e2e.ts tests/e2e/chat-screenshots-hub.e2e.ts \
  --project=e2e --workers=1
```

To refresh only the two hold frames, preserving every other image:

```sh
UATU_CAPTURE_CHAT_SCREENSHOTS=1 UATU_CAPTURE_HOLD_ONLY=1 bunx playwright test \
  tests/e2e/chat-screenshots.e2e.ts --project=e2e --workers=1 --grep 'desktop documentation gallery'
```

Normal tests skip these writers. Review image privacy and captions before publication. Capture helpers assert the key rendered states; the gallery itself is not independent validation. Hold/queue regressions live in `tests/e2e/chat-hold-queue-regressions.e2e.ts`; the reference-workdock suite covers normal/short/mobile/enlarged-text layouts and independent scrolling. Nonzero viewport/fixed-origin checks are synthetic. Native iOS in-app-browser verification remains outstanding; local WebKit stalled at initial tab activation before reaching these checks.
