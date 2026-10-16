## MODIFIED Requirements

### Requirement: The composer's subagent list counts subagents and tasks distinctly
On desktop the composer's subagent list SHALL keep one row per task, and its summary line SHALL NOT count a subagent once per task it was given. Where every task went to its own subagent the summary SHALL count subagents as it does today. Where a subagent was given more than one task, the summary SHALL state the number of distinct subagents and the number of tasks.

On touch, the compact worker disclosure SHALL replace duplicate pinned subagent/background lists. Its summary SHALL count canonical worker execution occurrences rather than launcher aliases, while expanded details SHALL preserve distinct task/launch references and existing model/cost attribution. Historical timeline launch/result records SHALL remain available; consolidation SHALL NOT create a second lifecycle or combine separate worker executions into one.

#### Scenario: One task per subagent reads as before
- **WHEN** a desktop conversation launched four subagents with one task each and all have finished
- **THEN** the summary reads "4 subagents finished"

#### Scenario: A subagent given two tasks is one subagent
- **WHEN** a desktop conversation launched three subagents, gave one of them a second task, and all have finished
- **THEN** the list shows four rows
- **AND** the summary reads "3 subagents · 4 tasks finished"

#### Scenario: Touch worker summary avoids launcher duplicates
- **WHEN** two launching task references refer to the same confirmed live worker occurrence
- **THEN** the touch summary counts one working occurrence
- **AND** expanding it preserves both task references and their attribution without duplicating the worker's execution state

## ADDED Requirements

### Requirement: Touch pending messages and workers use compact deliberate disclosures
Touch chat SHALL show at most one initially collapsed pending-message summary and one initially collapsed worker summary, omitting an empty summary. Pending text SHALL identify the total and steer/queued breakdown, such as `3 pending · 2 steers · 1 queued`. Worker text SHALL identify confirmed working and finished occurrences, such as `2 working · 4 finished`; finished SHALL include terminal failures/stops without implying successful completion. Uncertain workers SHALL be separately named rather than counted as confirmed working or finished. New work, replay and settlement SHALL update the summaries without automatically expanding touch details. Deliberate per-conversation expansion SHALL survive repaint, reselection and viewport changes within the page without leaking to other conversations.

Expanded pending details SHALL retain delivery order and existing edit/remove/convert/Send now actions. Expanded worker details SHALL retain inspection, truthful terminal outcomes, available shell output and existing parent/worker-stop safeguards. Replacement consequences, paused-batch warnings and applicable batch Send, and actionable operation failure/uncertainty SHALL remain visible outside collapsed details. Desktop disclosure defaults SHALL remain unchanged. The collapsed touch defaults are an explicit exception to earlier automatic-running-track expansion behavior.

#### Scenario: Loaded touch chat starts compact
- **WHEN** a touch conversation has two pending steers, one queued message, two working and four confirmed terminal worker occurrences
- **THEN** its pending and worker summaries are collapsed and show their respective counts
- **AND** no second pinned worker list duplicates the same work

#### Scenario: Work changes without opening details
- **WHEN** a worker appears or settles, or the conversation rehydrates while its touch details are collapsed
- **THEN** summary counts and outcome/uncertainty wording update without opening the details or moving focus

#### Scenario: Expanded details preserve actions and deliberate state
- **WHEN** the user expands details, changes conversations, returns and receives live updates
- **THEN** the original conversation retains its deliberate disclosure state and existing pending/worker actions
- **AND** another conversation does not inherit that deliberate state

#### Scenario: Replacement and batch risks remain readable while collapsed
- **WHEN** Undo/revert has staged a replacement and paused steers would resume together with the replacement or batch Send
- **THEN** pending counts, the applicable batch action and the full replacement/batch consequence remain readable without expanding details, including while typing
- **AND** no hidden warning is treated as user confirmation

#### Scenario: Settled and uncertain workers remain truthful
- **WHEN** the retained worker set includes a failure, a stopped worker and one unresolved outcome
- **THEN** the confirmed terminal occurrences contribute to finished with their individual outcomes available in details
- **AND** the unresolved occurrence is named uncertain rather than declared finished or successful

### Requirement: Compact touch composition preserves safe targets and conversation space
Touch chat SHALL keep Send and Stop distinct, retain operable capability-gated delivery selection and existing submission shortcuts, and put less-used settings/context/help/actions behind an accessible touch options menu rather than reducing touch target size. Visible action targets SHALL be at least 44×44 CSS pixels, with at least 8px separation between adjacent mutation actions, visible focus and non-overlapping hit regions. Opening configuration from the menu SHALL use the existing single adaptive picker rather than stack another options layer. Unsupported actions SHALL be absent, and explicit Continue SHALL remain available in layouts where worker controls are supported and blocking evidence exists, regardless of the account's automatic preference.

The entire dock SHALL retain the existing aggregate visual-height caps: 35%, 25% from 48rem width, and 24% during hardware-keyboard editing. Standard-size loaded phone layouts SHALL leave at least 40% of the visual band for the transcript; the tested tablet layouts SHALL leave at least 35%. Software-keyboard and short-landscape states SHALL retain existing worker-control/Continue suppression while keeping pending counts, replacement warnings and applicable paused-batch Send reachable. Safe-area handling, measured desktop geometry, explicit bottom pinning, remote reading anchors and interaction-request answering SHALL be preserved. Larger text SHALL retain readable warnings and reachable primary controls using scrolling/reduced secondary content rather than shrunken targets.

Menus SHALL fit the visual viewport, support keyboard navigation and one-layer Escape with invoker restoration, and consume outside touch dismissal without activating underlying actions. Visible controls SHALL activate reliably on the first tap during composition without discarding drafts or attachment/configuration state. Live updates and reduced-motion presentation SHALL NOT steal focus or fabricate completion announcements.

#### Scenario: Keyboard and landscape keep conversation space
- **WHEN** loaded touch chat uses 390px width with a 380px or 450px visual band, or 844px landscape width with a 230px visual band and the existing safe-area fixtures
- **THEN** Send, supported delivery and Stop fit inside the visual band with their minimum targets/gaps
- **AND** at least 40% remains for the transcript while pending replacement/batch safety remains reachable

#### Scenario: Hardware keyboard and tablet budgets stay bounded
- **WHEN** loaded 390×844 chat is focused without a software keyboard, or the tested 768×1024 and 1024×768 tablet layouts are used
- **THEN** the aggregate dock respects its applicable height cap and bottom safe inset
- **AND** the transcript keeps the phone/tablet minimum share without outer-surface scrolling

#### Scenario: Options dismiss without executing an underlying action
- **WHEN** a touch user taps outside options over Revert, Send or Stop
- **THEN** only the menu dismisses and no underlying mutation is sent
- **AND** Escape closes only the top layer and restores its invoker or surviving equivalent

#### Scenario: Disclosure changes preserve the reading intention
- **WHEN** pending/worker details expand, collapse or settle while the reader is remotely scrolled or explicitly bottom-pinned
- **THEN** the current reading anchor or explicit bottom-pin intention is preserved respectively
- **AND** controls remain hit-testable after final layout reservation and reduced-motion handling

### Requirement: Accepted Hub steer actions can automatically background eligible work
For an initiating Hub account whose authoritative personal preference is ON, chat SHALL consider one automatic native background-all follow-up after a confirmed steer action on an agent supporting both steering and background-blocking-work. This includes new composer steers, Queue → Steer, Send now of held input or paused steers, and submitted Undo/revert replacement steers. A paused batch resume SHALL result in at most one follow-up per accepted user action, not per resumed message. The initiating user's policy SHALL apply even in a workspace shared with users having different preferences, without changing those users' settings.

Automatic follow-up SHALL additionally require verified Hub policy authority bound to the current child instance, independent of the workspace/terminal credential. Missing bootstrap trust SHALL produce explanatory automatic-background-unavailable state rather than infer ON or trust unsigned principal metadata. This SHALL NOT undo an otherwise accepted steer or weaken existing primary-action access checks; a valid workspace credential alone SHALL NOT grant Hub principal authority.

The primary admission/resume SHALL be confirmed first; an optimistic message, timeout or staged replacement SHALL NOT count as acceptance. The automatic follow-up SHALL use current verified parent-scoped running-blocker evidence. Merely generating, pending, already detached, settled or uncertain work SHALL NOT force a background request; absent evidence SHALL NOT schedule a later job-start follow-up. Native eligibility racing to empty SHALL be an accepted no-op, not failure. The native operation affects all jobs still eligible when executed, including shell commands; it SHALL NOT be described as targeting one selected child or a fixed snapshot of workers.

This is the scoped exception to the earlier rule forbidding implicit backgrounding on sending: outside confirmed Hub steer actions with ON policy and both capabilities, that rule remains in force. Ordinary queued/idle sends, job starts, preference/menu selection, Undo/revert staging alone, repeated no-op conversion, standalone and unsupported agents SHALL retain existing behavior. Automatic backgrounding SHALL NOT create a steer, launch a new agent, flush the Uatu queue or change staged configuration/delivery preferences. Native steer next-step delivery, paused batch behavior and resume/interruption semantics remain authoritative; the UI SHALL NOT promise immediate delivery, atomic admit-and-background, or preservation of every foreground worker across native resume.

#### Scenario: Each accepted steer action qualifies once
- **WHEN** an ON Hub account confirms a new composer steer, Queue → Steer, held-message Send now or submitted replacement steer while verified eligible blocking evidence remains
- **THEN** its primary admission and pending transition complete before at most one native background-all attempt for the same parent
- **AND** the accepted message and attachments remain intact independently of the follow-up outcome

#### Scenario: Send now resumes a paused batch
- **WHEN** an ON Hub account successfully sends one paused steer now and native resume wakes all paused steers
- **THEN** the existing batch behavior is preserved without admitting duplicate prompts
- **AND** the action makes at most one post-resume eligible background attempt, with no promise that resume preserved still-blocking foreground work

#### Scenario: Admission has not been confirmed
- **WHEN** a steer is refused, pending admission exceeds its bound, or a resume outcome is ambiguous
- **THEN** no automatic background mutation follows that action
- **AND** uncertainty is reconciled without automatically resending or later backgrounding on a job event

#### Scenario: Private policy trust is unavailable after child replacement
- **WHEN** an ON account's steer is otherwise accepted but the replacement child has not established verified current-instance Hub policy trust
- **THEN** no automatic follow-up is authorized using a workspace credential, old-instance signature or unsigned principal metadata
- **AND** the accepted steer is preserved with explanatory unavailable feedback and existing explicit Continue behavior where permitted

#### Scenario: Nothing qualifies after acceptance
- **WHEN** an accepted steer leaves no verified running-blocker evidence, or workers are only detached/settled/uncertain
- **THEN** no automatic background call is forced and no future job-start watcher is installed

#### Scenario: Mixed eligible jobs race with native execution
- **WHEN** an accepted steer is followed by one background request while eligible subagents and shell jobs block that parent
- **THEN** native all-eligible behavior is used rather than a subagent-only operation
- **AND** a race to no eligible jobs is harmless while a new blocker present at native execution is not promised exclusion

#### Scenario: OFF, unsupported and non-steer actions do not trigger automation
- **WHEN** the preference is OFF, no Hub account context exists, either capability is absent, or the action is a queue/idle send, menu choice, job start, replacement staging or no-op conversion
- **THEN** no automatic background request occurs and existing delivery/Continue behavior is preserved

### Requirement: Automatic background outcomes never erase or resend accepted steer actions
Affected action responses SHALL distinguish the primary steer/resume outcome from any automatic-background outcome. Once primary acceptance is confirmed, a follow-up refusal, unavailable evidence, timeout or ambiguous response SHALL preserve and report the accepted primary action; it SHALL NOT restore it as a failed draft, roll it back to the queue, or resend it. Background acknowledgement SHALL mean only request acceptance, not a count of affected workers, immediate steer delivery or worker completion. Actionable partial/unknown outcome text SHALL remain visible outside collapsed details with read-only state recovery and capability-gated explicit Continue available when eligible; no automatic mutation retry is introduced.

The composite operation SHALL share original admission ordering and retain primary plus follow-up results under an initiating-account-scoped receipt. While retained, a same-identifier retry SHALL return the same result without repeating primary admission/resume or backgrounding, reevaluating a changed preference or affecting later blockers. A primary-unknown or follow-up-unknown outcome SHALL be retained rather than treated as a retryable deleted failure; no follow-up SHALL start after a timed-out primary or from late evidence. The client SHALL NOT automatically replay uncertain mutations across reconnect/reload. Receipt expiry, capacity eviction, adapter recreation or restart end deduplication; the system SHALL NOT promise durable exactly-once execution across those boundaries.

Native steer/resume unknown retention SHALL remain active without automatic-policy context, including degraded Hub and standalone operations. Queue → Steer and held/paused Send now browser transport failures or server 5xx SHALL produce persistent page-local unconfirmed guidance and read-only reconciliation, without changing an unrelated composing draft or retrying the mutation. Definite refusals SHALL retain their existing handling.

#### Scenario: Background fails after steer acceptance
- **WHEN** the provider confirms the steer but definitively refuses its background follow-up
- **THEN** the action reports the accepted steer and failed/unavailable follow-up separately with explanatory text
- **AND** the accepted message is neither restored to the draft nor requeued/resubmitted

#### Scenario: Upstream background response is lost after application
- **WHEN** native backgrounding may have applied but Uatu cannot confirm its response
- **THEN** the accepted primary result retains an unknown follow-up receipt and neutral uncertainty feedback
- **AND** retrying the same identifier while retained issues neither a second steer/resume nor another background request

#### Scenario: Browser loses a known composite result
- **WHEN** Uatu retained the accepted composite result but the browser lost its response, another blocker appeared and the account changed its preference
- **THEN** the same-account same-identifier retry returns the original result/policy without repeating either native mutation

#### Scenario: Primary admission response is unknown
- **WHEN** the provider may have accepted a steer/resume but its acknowledgement is lost
- **THEN** the primary-unknown receipt is retained, no background request is made and the action's message/attachments remain available as unconfirmed rather than automatically resubmittable failed input
- **AND** same-identifier retries while retained do not duplicate the primary action

#### Scenario: Late response and ended receipt lifetime
- **WHEN** a timed-out native operation later settles, or its receipt expires, is evicted or is lost on adapter/process recreation
- **THEN** read-side evidence can update visible state without initiating a delayed follow-up or automatic mutation replay
- **AND** old request identifiers are not claimed to remain deduplicated after receipt loss

#### Scenario: Shared-workspace users reuse an identifier
- **WHEN** A and B issue actions in the same conversation using the same client request identifier but opposite personal preferences
- **THEN** neither receives the other's personal action receipt or policy metadata
- **AND** each action uses its own authenticated initiating-account scope while conversation/worker state remains shared

#### Scenario: Unknown retention survives unavailable bootstrap
- **WHEN** native steer admission or resume applies but its acknowledgement is lost while private Hub policy trust is unavailable
- **THEN** an immediate same-account same-identifier retry retains unknown with only one native primary mutation
- **AND** no automatic background request or unsigned policy context is introduced

#### Scenario: Queue action loses its browser acknowledgement
- **WHEN** a Queue → Steer, held Send now or paused-batch Send now result is lost to browser transport failure or a server 5xx
- **THEN** unconfirmed guidance remains visible through read-only reconciliation and later paints
- **AND** the unrelated composing draft stays unchanged and reconnect/reload sends no automatic mutation retry
