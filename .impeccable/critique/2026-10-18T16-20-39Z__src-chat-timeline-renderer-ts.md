---
target: "the changes this PR (#533)"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/chat/timeline-renderer.ts"
target_fingerprint: "sha256:5bd23184206176254115248e7fd69d494bda9158a316aa4f78b016a0b33ca9d4"
target_path: src/chat/timeline-renderer.ts
timestamp: 2026-10-18T16-20-39Z
slug: src-chat-timeline-renderer-ts
---
# Critique: fix-chat-readability-batch (PR #533) — chat question forms, skill rows, token scales

## Design Specificity Verdict

**Authored, with one tell-tale generic patch on top (Assessment A).** The question form is unmistakably made for this product: option rows are full-width pressable cards because a radio dot beside a line of text is a ~20px target on a phone (styles.css:9150); resolved questions recede to a one-line trace; queued requests say "Waiting its turn — answer the newest request first"; the context readout draws a Pac-Man wedge. The skill-row fix is likewise specific — a timeline whose rows name their subjects now names the skill. The generic patch: four `.chat-question-tab` pills rendering the identical truncated sentence under the live OpenCode mapping — widget-default thinking; a form authored for this product would surface the string that differentiates steps (the short label it already holds in `question.prompt`).

**Deterministic scan (Assessment B):** clean over all four changed sources (exit 0, 0 findings). Stated fallback signal: regex-only matching on .ts input — parsed-page element rules (tiny-text, contrast, and other element rules) did not run; the clean result is an undercount, not a clean bill of health. Browser evidence (measured e2e captures, 390px + 1400px) found no clipped text, no overlapping elements, no invisible controls; the active statement wraps over 4 lines with `clippingAncestor: null`.

Where they agree: the *presentation* of the fixed form is mechanically sound (B) while the tab strip's *information design* is the weak spot (A) — B measures the tabs as the only visually truncated element on the card; A explains why that matters. Detector caught nothing A missed (its element rules never ran on TS source — not a false negative claim, an undercount).

## Design Health Score (Assessment A)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Answer button silently disables on the last step; the answered tick is CSS-only |
| 2 | Match System / Real World | 3 | Panel order inverts narration: full question renders above its own "Q1 — Priorities" label; "Reject" doesn't say what gets rejected |
| 3 | User Control and Freedom | 3 | No undo after Answer; mid-form "back" is unlabeled tab clicks |
| 4 | Consistency and Standards | 3 | Hand-rolled tablist: no aria-controls/panel ids, no arrow-key roving |
| 5 | Error Prevention | 3 | Missing-required-step prevention is a greyed button; nothing points to which tab |
| 6 | Recognition Rather Than Recall | 2 | All four tab pills print the identical truncated sentence |
| 7 | Flexibility and Efficiency | 2 | No jump-to-first-unanswered accelerator; three optional empties still step Next×3 |
| 8 | Aesthetic and Minimalist Design | 3 | Same sentence renders twice per card (pill + legend); panel framed five times over |
| 9 | Error Recovery | 3 | Good live-region recovery on Enter-submit ("Still to answer: …" + auto-jump); nothing equivalent from the disabled button |
| 10 | Help and Documentation | 2 | `optional` / `choose one or more` hints are passive; the greyed-Answer moment gets zero contextual help |
| **Total** | | **27/40** | **Acceptable (top edge)** |

## Cognitive Load (stepped form): moderate — 3 failures

Chunking (5 option rows + custom per panel), visual hierarchy (Next and Reject render with identical secondary styling — no `.chat-primary-button`), decision-point load (5 options + 2 buttons + 4 pills = 11 interactive elements), working memory (earlier steps' full text exists nowhere outside their own panel). Progressive disclosure, grouping, single-focus all pass.

## Strengths

1. **The visible legend serves the class, not the instance** — the comment encodes the either-mapping reasoning, and the e2e pins it with measurements at both viewports.
2. **Honest tick semantics** — `syncQuestionForm` splits "made a real choice" from "answerable as-is" instead of one blurred flag.
3. **Option cards designed from the input device** — full-width label-wrapped rows, real native inputs (state survives zoom/contrast), inline descriptions.

## Priority Issues

1. **[P1] The step strip cannot tell steps apart.** All four pills print the same ellipsised sentence (tab label = `question.header`; live mapping puts the differentiating label in `question.prompt`). Navigation, progress, and preview die at once. Fix: render each tab pill from the shorter of prompt/header, falling back to the header — the visible legend already guarantees the full statement. Suggested command: `$impeccable layout`.
2. **[P1] The form's primary action has no primacy.** Next and Reject render identically (two equal grey buttons in both captures). Fix: apply the existing `.chat-primary-button` treatment to Next/Answer; demote Reject to a quiet text action with a consequence note. Suggested command: `$impeccable layout`.
3. **[P2] Progress and answered state are invisible to assistive tech.** The tick is CSS `::before` content; advancing steps announces nothing. Fix: visually-hidden "Answered" state or composed aria-labels; announce panel changes via the existing live-region announcer. Suggested command: `$impeccable harden`.
4. **[P2] A disabled Answer with no reason and no route.** Greyed at 0.5 opacity, not focusable, while the app already has the better recovery ("Still to answer: <headers>" + auto-jump) wired only to the Enter path. Fix: keep the button enabled and route submit through the missing-check, or add one inline line under the actions. Suggested command: `$impeccable harden`.
5. **[P3] Step label reads as a caption under its own question.** The panel prints the question then "Q1 — Priorities optional" below it. Fix: hoist the short label + hint above the legend as the panel's eyebrow. Suggested command: `$impeccable layout`.

## Persona Red Flags

**Jordan (first-timer):** "Is the same question asked four times?" — four identical pills. Next/Reject equal weight; consequence of Reject unstated. On a required step: greyed Answer, no explanation. After Answer: no confirmation of what was submitted.

**Sam (screen reader, keyboard-only, color-blind):** Legend-as-fieldset-name is genuinely good. But the tick's new meaning never reaches the accessibility tree (CSS content); step changes are silent; the tablist lacks aria-controls/ids and arrow-key roving; the disabled button is unreachable, so the "Still to answer" rescue exists only on the Enter path. Color-blind: accent-tint state carries border/position/native-control second channels (code-verified, not visually verified in the captures).

**Casey (one-handed phone):** Thumb path decent (full-width cards low in the panel, keyboard-cooperative scroll for the custom field). Unverified: whether step advance retries scroll positioning, and whether returning to a half-answered form states "2 of 4 answered" — no restatement exists at card level.

## Minor Observations

- B-suffix change clean and bounded in code/tests; **no capture in this change shows a live B figure** — a receipt screenshot at ≥1e9 tokens would close the evidence gap.
- Skill-row fix verified end-to-end in code; subject passes through `workspaceRelative()` — presumably identity for non-path skill ids (unverified for a path-shaped id).
- `.chat-request fieldset.is-missing` danger styling appears orphaned for question panels — wire or remove.
- The e2e's "distinct beyond the accent tint" check measures indicator visibility, not visual distinctness; a chosen-vs-unchosen capture pair would close the gap.

## Provocative Questions

1. If the short label is the best name for a step in the tab, the panel eyebrow, and the recovery message — should the tab strip exist in this shape at all, or should the wizard simply state "Question 1 of 4: Priorities"?
2. The form recedes perfectly once resolved — what would it take for the submit moment to feel like the peak: a one-line restatement of the answers ("Answered 4 — Priorities: Timeline rendering · …") in the timeline, the way usage pairs the compact figure with its exact count?
