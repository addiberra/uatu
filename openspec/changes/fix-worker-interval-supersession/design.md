# Design

## Context

See `proposal.md` for motivation. `foldLaunch` can identify aliases using historical idle boundaries, but its subsequent supersession loop marks every unresolved same-child occurrence uncertain regardless of execution order. In the reproduced case, content `[new_a, old, new_b]`, execution starts `[21,13,25]`, boundaries `[17,30]`, and pending reports `[18,40]` yield four rows instead of two completed occurrences.

This record precedes corrective source edits. The earlier history-correlation record was retrospective; the user accepted that disclosed one-time deviation, not a waiver of future planning. The recovery-edges correction was planned before implementation, and its archived record needs that chronology made explicit.

Round 2 independently reproduced two further defects before their corrective implementation. First, native `time.ran` is published before permission approval and job admission: calls at 13 and 15, with accepted-running launcher completion at 16 and 23 and child idle at 17, can represent distinct generations, not aliases. Second, a failed first shell inventory followed by a transcript-only read currently admits the shell without repeating the outstanding ownership/current-state lookup. Both violate existing conservative lifecycle/control contracts; their corrections extend this implementation plan without changing normative requirements.

## Goals / Non-Goals

**Goals:** Keep provably separate historical intervals available for same-interval aliasing until explicit reports resolve them. Preserve parent content order and conservative control admission.

**Non-Goals:** Sort the transcript, weaken live supersession, infer completion from idle, clear uncertainty without proof, change notification-before-launch policy, or modify services/accounts.

## Decisions

1. **Use verified interval separation, not content position, to fence historical supersession.** Add a narrow history-only distinction for launches proven to occupy different execution intervals. Preserve ordinary supersession when evidence is missing, tied or otherwise ambiguous. Merely disabling supersession for all history is rejected because it discards ambiguity safeguards; sorting parent tools is rejected because it changes presentation semantics.
2. **Keep grouping and reporting independent.** Same-interval aliases must satisfy the existing all-launch comparison; explicit native completion reports remain the only terminal evidence. An older report must not settle a newer interval. Do not force correlation by clearing evidence uncertainty or changing report clocks.
3. **Test at the provider seam before editing implementation.** Extend the nearby historical fixtures to cover pending inbox reports, all content permutations of the three launches, and split-assistant content. Check both message history and reconciliation, canonical result identities, unchanged tool order, and read-only API calls. Retain negative missing/tied-boundary and delayed-report tests, with focused additions where the fix changes a guard.
4. **Keep control evidence separate from transient display reconstruction.** Exercise existing live supersession, revoked-target, observation-gap, ownership and capacity protections. A display fix must not readmit a retained unavailable target or authorize Stop against a newer execution.
5. **Treat launcher timing as an admission window, not exact worker identity.** Use native accepted-running completion evidence to bound admission; when the possible window crosses or touches a child boundary, keep aliasing and report application conservative. A report predating accepted launch completion cannot settle the later launch without stronger occurrence evidence. Do not invent an actual job-start timestamp or sort content to conceal ambiguity. Verify both a still-running delayed generation and two completed generations, keeping uncorrelatable results readable.
6. **Require fresh target verification across callers.** Preserve the initial inventory retry opportunity without allowing transcript projection to substitute for failed active/shell/ownership evidence. Distinguish inventory-capable reads from transcript-only reads or retain bounded target-specific outstanding verification as needed; successful fresh recovery must still admit valid unchanged workers, and healthy retained siblings must remain usable. Keep new retained state inside existing aggregate control budgets and preserve revocations, gap and overflow closure.

## Risks / Trade-offs

- Suppressing too much supersession could merge ambiguous calls → require proof of distinct historical intervals and regress missing/tied evidence.
- Content permutations could pass reconciliation but fail message history → check both real provider entry points and preserve tool order.
- Reports processed later could settle the wrong generation → assert exact report-to-launch mapping and retain delayed-old-result coverage.
- A narrow positive fix could weaken live controls → keep live behavior unchanged and run control/normalization/provider tests.
- Repeated review can reveal additional defects → record new findings and plan material scope changes before implementation; do not claim bug-freedom from a clean review.

## Migration Plan

No migration. Deliver verified corrections in the existing ready-for-review PR #559 after fresh independent standards and spec reviews. Obtain approval for proposed PR-description updates before publication. Keep this record active while the PR is open; leave archival to the repository's normal finalization workflow without changing normative specs. Revert the corrective code commit to roll back product behavior. Neither running hub is deployed or restarted by this work.
