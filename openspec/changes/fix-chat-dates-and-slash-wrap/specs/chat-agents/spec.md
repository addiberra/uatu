## ADDED Requirements

### Requirement: The conversation chooser groups conversations by the day of their last activity
The conversation chooser SHALL file every agent's conversations alike
under a heading for the reader's local calendar day of each conversation's
last activity, as the agent reports it. Headings SHALL appear newest day
first, with conversations newest first within a day. A heading SHALL read
"Today" or "Yesterday" for those days, and otherwise the weekday and date,
adding the year when it is not the current year. Dates, weekdays, and times
SHALL be formatted in the reader's locale and time zone, matching the
timeline's day separators. Each entry SHALL show the clock time of its last
activity after its title and, where the workspace offers several agents,
its agent. A last-activity time later than the reader's clock SHALL be read
as now. A conversation whose agent reports no usable time (none, or a
placeholder before the year 2001) SHALL show no time and SHALL be listed
after the dated days, under an "Undated" heading when any other
conversation is dated and without a heading otherwise. When the reader's
local day changes while the chooser is shown, its headings SHALL be
relabelled without waiting for the inventory to change. Grouping SHALL NOT
change which conversation is selected.

#### Scenario: Conversations from different days are grouped
- **WHEN** a workspace holds conversations last active today, yesterday, and three days ago
- **THEN** the chooser shows the headings "Today", "Yesterday", and the weekday and date of three days ago, in that order
- **AND** each conversation is listed under the heading for the day of its last activity

#### Scenario: Both agents' conversations share the days
- **WHEN** an OpenCode conversation and a Claude Code conversation were both last active yesterday
- **THEN** both are listed under the one "Yesterday" heading, newest first
- **AND** each entry still names its agent

#### Scenario: Each entry shows its last-activity time
- **WHEN** a conversation was last active at 09:30 yesterday
- **THEN** its entry shows its title followed by 09:30 in the reader's clock format

#### Scenario: Activity moves a conversation to today
- **WHEN** a conversation listed under "Yesterday" gains new activity
- **THEN** once the inventory reflects it, the conversation is listed first under "Today"
- **AND** a day heading left with no conversations is removed

#### Scenario: A conversation with no usable time is undated
- **WHEN** an agent reports no last-activity time for a conversation while other conversations are dated
- **THEN** that conversation is listed after the dated days under "Undated" with no time shown

#### Scenario: Headings roll over at midnight
- **WHEN** the reader's local day changes while the chooser is shown
- **THEN** the heading that read "Today" reads "Yesterday" without any conversation changing

#### Scenario: The touch layout groups alike
- **WHEN** the chooser is opened in the touch layout
- **THEN** it shows the same day headings and entries as on desktop
