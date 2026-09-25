## ADDED Requirements

### Requirement: The conversation timeline marks the day its content happened
For every agent's conversations, the timeline — the main transcript and a
subagent drill-down alike — SHALL place a day separator at the start of
each run of content that happened on one local calendar day of the reader,
including the first day shown. Content with no known time — none
reported, or a placeholder time before the year 2001 — SHALL be treated as
belonging to the day of the content before it and SHALL NOT start a
separator. A separator SHALL read "Today" or "Yesterday" for those days,
and otherwise the weekday and date, adding the year when it is not the
current year; dates and weekdays SHALL be formatted in the reader's locale
and time zone. Replayed or paged-in history SHALL be separated by the same
rule as live content, from the times each agent reports for it. While the
reader scrolls through a day's content, that day's separator SHALL remain
visible at the top of the transcript until the next day's separator
replaces it. Separators SHALL NOT be treated as timeline items: they SHALL
NOT participate in scroll anchoring, activity grouping, or item actions.
When the reader's local day changes while a conversation is shown, the
existing separators SHALL be relabelled without waiting for new content.

#### Scenario: Messages on different days are separated
- **WHEN** a conversation has messages from two days ago, yesterday, and today
- **THEN** the timeline shows a separator with the weekday and date before the first of the oldest day's content
- **AND** a "Yesterday" separator before yesterday's first content
- **AND** a "Today" separator before today's first content

#### Scenario: A single-day conversation from the past states its day
- **WHEN** the reader reopens a conversation whose content all happened on one earlier day
- **THEN** one separator naming that day appears above its first content

#### Scenario: Replayed history is dated
- **WHEN** the reader opens a Claude Code or OpenCode conversation whose history is read back from the agent's stored transcript
- **THEN** its day separators reflect the times the agent recorded for that content, not the time it was read

#### Scenario: The day stays visible while scrolling back
- **WHEN** the reader scrolls up through a long day of content so that its separator has scrolled out of view
- **THEN** that day's separator remains visible at the top of the transcript
- **AND** it is replaced by the earlier day's separator once the reader scrolls past that day's boundary

#### Scenario: Separators follow the reader's time zone
- **WHEN** two messages were sent at 23:50 and 00:10 in the reader's time zone
- **THEN** a day separator appears between them, regardless of the agent's or server's time zone

#### Scenario: Labels roll over at midnight
- **WHEN** a conversation stays open across the reader's local midnight
- **THEN** the separator that read "Today" reads "Yesterday" and the one that read "Yesterday" reads the weekday and date, without new content arriving

#### Scenario: Separators do not disturb reading position
- **WHEN** a new day's first content arrives while the reader is paused above the end of the timeline
- **THEN** the reader's anchored position is preserved as for any other appended content

### Requirement: Slash-command suggestions show their descriptions in full
Slash-command suggestions, for every agent, SHALL wrap a command's name,
description, and argument hint onto further lines rather than truncating
them, and every suggestion SHALL show its complete description whether or
not it is highlighted. The suggestion list SHALL remain scrollable, SHALL
NOT scroll horizontally in desktop or touch layouts, and SHALL keep the
highlighted suggestion in view as the highlight moves.

#### Scenario: A long description wraps
- **WHEN** the user types `/code` and the agent offers `/code-review` with a description longer than one line of the suggestion list
- **THEN** the description continues onto further lines instead of ending in an ellipsis on one line

#### Scenario: Every suggestion shows its full description
- **WHEN** the suggestion list shows several commands with multi-line descriptions
- **THEN** each suggestion shows its complete description, highlighted or not

#### Scenario: The highlight stays in view among tall suggestions
- **WHEN** the user moves the highlight with the keyboard past suggestions whose descriptions span several lines
- **THEN** the highlighted suggestion is scrolled into view within the list

#### Scenario: Both agents wrap alike
- **WHEN** a Claude Code conversation and an OpenCode conversation each offer a command with a long description
- **THEN** both suggestion lists wrap that description the same way
