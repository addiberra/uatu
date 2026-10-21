## Context

`formatTokens` in `src/chat/usage.ts` is the shared compact formatter for
every token figure the chat surface shows; `receipt-view.ts` and the
context readout already pair each compact figure with the exact count
(title, `toLocaleString()`, breakdown), so compactness never has to be
the only statement. Skill-loading rows parse their input in
`src/chat/tool-detail.ts` (`case "skill"`), currently reading only
`name` and `skill` keys; the collapsed row's subject comes from
`toolSubject(detail)`. Triage happened against upstream main
`bef981e6`; see proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Billion-scale figures read as billions wherever the shared formatter renders.
- A skill loads reads by its name in the collapsed row for every payload
  shape a Claude Code CLI generation sends, with fork navigation untouched.
- A stepped multi-question form states each question in full — wrapped,
  unclipped — and its answered ticks state real choices.

**Non-Goals:**

- New usage surfaces (e.g. showing available skills in chat — #465 stays separate).
- Broader question-rendering or provider-state changes beyond the card's
  presentation (form field mapping, reply normalization stay untouched).
- Changes to exact-figure access paths (titles, breakdowns, receipts).

## Decisions

- **B suffix at one decimal** (`1.0B`): continues the `M` branch's existing
  one-decimal style rather than the two-decimal example also offered by
  issue #464 — chosen with the user during scoping. Simpler than trimming
  trailing zeros and consistent across scales.
- **Skill payload tolerance is key-based only** (`name ?? skill ?? id`):
  the current Claude Code Skill tool's input schema names the skill by id
  alone (tool schema: "the skill ID must match an available skill"); repo
  fixtures cover the older `skill`-keyed fork-era payload and the `name`
  variant. No speculative shapes (nested objects, arrays) — unconfirmed
  outside any evidence we hold. Evidence basis to be stated in the PR.
- **One commit per issue** on this worktree's branch, so review and revert
  stay clean and release-note attribution stays truthful.
- **Post-critique polish rides the #520 commit**: an independent
  impeccable critique of the rendered result (dual assessment, 27/40)
  found five presentation debts in the fixed card. All five are folded
  in: step pills render the shorter of prompt/header (four identical
  ellipsised sentences told nothing about which step was which); the
  Next/Answer button takes the primary treatment and Reject demotes to a
  quiet action stating its consequence; the answered tick reaches the
  accessibility tree and step changes are announced ("Question 2 of 4:
  …"); the Answer button no longer disables — submit routes through the
  missing-check that jumps and says what is owed; and the panel fronts
  its full statement with the step label as an eyebrow.
- **#520's gate resolved to a confirmed, localized fix**: the reproduction
  came from a live OpenCode multi-question form the user captured
  mid-session — its mapping puts the long question text in the structured
  question's header (the tab strip's label) and a short label in the
  prompt, and marks every question optional. Two localized defects
  followed: the whole question was readable only as a one-line ellipsised
  tab (the stepped legend was screen-reader-only), and every tab wore the
  answered ✓ because an optional empty counted as answered. The fix
  renders the active panel's legend visibly — wrapped, unclipped — and
  ties the tick to a real selection, leaving the optional-empty gating of
  the Answer button intact. Synthetic fixtures with short headers had
  hidden both defects; the e2e now seeds the live form's shape.
- **Review round 2, one owned line for the whole form (#533 findings)**:
  the owed-answer line stays a single status-region message that names what
  the form still owes — not what was last left. Tab navigation and the Next
  advance settle the same whole-form outstanding set through one helper, so
  an optional empty behind Next can neither clear nor speech over a required
  step's line. A successful rejection retires the line beside the form it
  leaves (guarded, success-only: a failed rejection's own status and any
  newer unrelated message stand untouched). The unit regression tests run
  the wired handler in linkedom because the connected e2e flow's own
  resolution event overwrites the status region, which would mask the
  finding.

## Risks / Trade-offs

- [Compact B figures could read ambiguously next to the `B`-suffixed *bytes*] → Token figures always sit in token-labeled contexts ("tokens", readout columns); no change needed.
- [`999,999,999` still renders `1000.0M` at the boundary] → The suffix switches at the value itself, not the rounded figure; the spec scenario pins this boundary so the readout stays honest.
- [An unknown CLI generation may name the skill by a key we do not cover] → Key-based fallbacks are ordered `name ?? skill ?? id`; a new key is a one-line follow-up, and the generic fallback still renders the row.
- [The visible legend repeats the tab's label in full] → The tab stays a compact one-line strip and the legend is the only complete statement — the same pattern the token figures already follow (compact beside the exact figure).

## Open Questions

- None. The #520 outcome settled on the reproduced live form; the fix is in.
