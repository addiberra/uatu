## ADDED Requirements

### Requirement: Usage figures read at their count's scale
A conversation's token usage figures, wherever the chat surface shortens
them for at-a-glance reading, SHALL render with the scale suffix that
matches the count's magnitude — thousands, millions, then billions with a
`B` suffix — so a billion-scale total never reads as thousands of
millions. The exact figure SHALL remain reachable through the breakdown,
title, or expansion that already carries it.

#### Scenario: A billion-scale input total reads in billions
- **WHEN** the usage readout shows a model whose input token total has reached 1,023,700,000
- **THEN** the compact figure reads `1.0B`, not `1023.7M`
- **AND** the exact total remains available through the readout's breakdown or title

#### Scenario: Counts below a billion keep their compact form
- **WHEN** the usage readout shows figures below one billion tokens
- **THEN** they render as before — bare counts, `k` below a million, `M` below a billion

### Requirement: A loaded skill is named where it loads
A tool row for a skill-loading event SHALL name the skill it loads in the
collapsed row, whichever input key the agent's CLI generation names the
skill by — a `skill` key, a `name` key, or an `id` alone. The name SHALL
be stated once in the row, as its subject, and the row's expanded details
and forked-transcript navigation SHALL behave as for any skill row.

#### Scenario: The current Skill tool names the skill by id alone
- **WHEN** a skill-loading event's input carries only an `id` naming the skill
- **THEN** the collapsed row states that skill's name as its subject, not a bare generic label
- **AND** the name appears exactly once in the row, with no duplication through the expanded body

#### Scenario: Older payloads keep their behavior
- **WHEN** the input names the skill by a `skill` or `name` key
- **THEN** the row reads exactly as it did before this change
- **AND** a forked skill still offers its transcript from its row

### Requirement: A multi-select question reads whole and states its selection
A multi-select question the agent asks SHALL be readable whole — its full
prompt visible at narrow and wide viewports, wrapped rather than
truncated — and every option's selected or unselected state SHALL read
distinctly from more than colour alone, at narrow and wide viewports
alike.

#### Scenario: A long multi-select prompt is fully readable
- **WHEN** a multi-select question carries a prompt long enough to reach its container's edge at a narrow viewport
- **THEN** the full prompt remains readable, wrapped rather than cut off

#### Scenario: Selected and unselected options are told apart
- **WHEN** a multi-select question is presented with some options chosen
- **THEN** each chosen option reads as chosen and each unchosen option reads as unchosen, from the row's own presentation, at narrow and wide viewports
