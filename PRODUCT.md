# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The core interface runs in browsers and as an installable PWA on desktop,
tablet, and phone. UatuCode Desktop is a macOS client for hubs; it does not
run workspace sessions itself.

## Users

Hands-on developers directing AI coding agents and reviewing their work.
They move between desktop and mobile to follow progress, understand changes,
and respond when an agent needs input.

## Product Purpose

UatuCode is a codebase watcher and agent companion. It brings live file
previews, repository changes, agent conversations, and terminals into a
workspace so developers can direct work while understanding what changed.
Success means remaining informed and able to act without losing the thread
of the work.

## Positioning

Use the developer's own agents alongside the files they change. Claude Code
and OpenCode are first-class integrations: each should expose its SDK's
capabilities rather than be reduced to their shared subset.

The existing product direction is retained for this fork. Longer-term aims
include onboarding, peer review, and self-assessment of cognitive debt;
these are direction, not claims of completed functionality.

## Operating Context

- A developer runs a hub locally or on a remote machine they control, signs
  in, and adds or clones a folder as a workspace.
- Workspaces combine file browsing, rendered/source/diff views, change
  overview, Git history, agent chat, and embedded terminals.
- Follow mode moves to the latest changed file. Turning it off lets the
  developer stay with a chosen file while its preview continues updating.
- Git worktrees support separate branch workspaces with independent
  terminals and conversations.
- Phone workflows include workspace management and responding to ongoing
  work, not only passive observation.

## Capabilities and Constraints

- Preview Markdown, AsciiDoc, diagrams, and source files as they change.
- Keep agent permissions, questions, approvals, cancellation, and task
  progress actionable within workspace chat.
- Require hub login, including on localhost. Repository credentials and
  machine-wide agent accounts are distinct settings concerns.
- Preserve the distinction between browser navigation and server-side
  workspace lifetime. Closing the desktop client does not stop sessions.
- Ordinary touch-mode trips between a workspace and Hub/Settings preserve
  that workspace's live browser state. Reloading, switching workspaces,
  signing out, revocation, and Stop have different lifetime implications;
  browser termination cannot preserve memory-only drafts or uploads.
- Embedded terminals depend on Bun PTY support; current Windows limitations
  are documented in `README.md`.

## Brand Commitments

Retain the UatuCode product name, `uatu` command name, and existing logo
assets. This initialization preserves the current product direction; it
does not establish a new visual identity.

## Evidence on Hand

- `README.md`: current capabilities, usage, platform limitations, and roadmap
  distinction.
- `docs/CHAT.md` and `docs/WORKTREES.md`: agent and branch-workspace workflows.
- `ARCHITECTURE.md`: runtime and state-lifecycle context.
- `uatu-logo.svg` and `uatu-screenshot.png`: existing product assets.
- `design/hub-mobile/`: existing mobile design work, separate from this
  product record.

## Product Principles

1. Keep developers informed and in control of agent work.
2. Connect conversations and actions to the workspace files and changes.
3. Preserve each agent's useful capabilities rather than flattening them.
4. Support continuity across desktop and touch workflows while making
   session and state boundaries clear.

## Open Decisions

No additional fork-specific positioning or product-specific accessibility
standard was established during initialization. Future decisions should
distinguish confirmed requirements from proposals.
