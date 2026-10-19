# Uatu Web UI design system

A small, Apple-inspired system for the **mobile Hub and its management flows**.
It is a Web/PWA implementation, not UIKit, SwiftUI, SF Symbols, or an Apple-certified
interface. Existing workspace interiors, monospace content and desktop presentation
are not redesigned by adopting it.

Live reference in the isolated mock review: **`/review/design-system`**.
Examples use the real product modules and styles, not copied control markup.
They never perform Hub mutations and are not a product Settings destination.

## The central rule: meaning determines presentation

| Meaning | Use | Do not use |
| --- | --- | --- |
| Observed information | `infoRows`: labeled, selectable facts with readable values | Disabled inputs, a paragraph wall, or a selected-looking action |
| Supporting explanation | `text`: short secondary copy near the relevant item | The only rendering of important names, paths, status or proposed changes |
| Navigate to an object/page | `listRow`, or `destinationRow` in the shell | A mutation disguised by a disclosure chevron |
| Perform an action | `action`: explicit verb, destructive tone where applicable | A generic More menu or a filled selected-row treatment |
| Edit a value | `field` / `select`: persistent label and a visible editable surface | An unlabeled blank area or page-load autofocus |
| Independent Boolean choice | `check`: native checkbox semantics, accessible green switch | A switch for one-of-many choices; automatic backend writes from a draft |
| Choose one of several values | `choiceGroup`: native radio semantics and checkmark rows | Several independent switches |
| Important security information | Shared `advisory` recipe, before the relevant controls | A hidden footer notice, drawer, or duplicate dismissal controls |
| Review an operation | Groups of `infoRows` with Current / After applying / Change on apply | Prose that mixes identity, current state and future effects |
| Edit or inspect task details | Shared `createTaskView` full-page editor/result | A drawer or a second implementation of focus/history rules |
| Confirm a consequential action | Explicit `env.confirm`: centered, labeled confirmation | An ordinary navigation menu styled as a destructive dialog |

Every action has one natural home. Settings uses top Back and contextual options.
Only genuinely frequent controls need special lower-screen placement. Current
values stay accurate; controls never open themselves merely because a page appeared.

Workspace cards expose a text **Details** action with workspace name and full
path in its accessible name. It opens the existing full-page information and
management view directly; Back restores the card trigger and Hub scroll. The
tinted **Open** / **Start** command remains separate and prominent; unavailable
checkouts still allow Details while their session command is disabled.
The Hub list scrollport ends above the measured dock with an 8px gap, so the
trailing Add Workspace explanation scrolls into clear space rather than under
navigation. This is ordinary list scrolling, not a pinned creation toolbar.
Dock placement, Return identity, preferences and safe-area measurements remain
owned by their existing modules.

Background Hub reads retain the last verified workspace list while pending;
identical presentation keeps its mounted keyboard/disclosure owners. Changed
facts restore the matching action or family summary; a removed control falls
back to the page heading. Failed reads still expose the existing Retry state.
A changed authenticated user replaces the previous user's mounted owners even
when the workspace presentation is identical.
Clone progress uses a persistent atomic status region for phase, cancellation
request and outcome text; ordinary output does not rewrite its announcement.
Clone's required fields, authentication host and Rename display name associate
local validation with their field through `aria-invalid` and `aria-describedby`.
Correction clears that field's description without replacing the draft or
clearing a different operation's alert. Other operation failures remain alerts;
this is bounded field validation, not a general server-error mapping.
Repeated failed validation updates the field's existing description to match
the current failure. Selecting no authentication credential clears an obsolete
host error before disabling its field. Return remains available during pending
revalidation, but failed authentication revalidation disables it until current
workspace facts are verified again; an outage does not sign the user out.

## Product modules and ownership

```text
domain flows / overview
          |
          +--> design-system.ts  semantic, stateless HTML primitives
          |          +--> styles.css  one recipe per pattern
          |                     +--> tokens.css  semantic theme
          |
          +--> flow-ui.ts        binding, validation, async ownership, notices
          +--> task-view.ts      editor/confirmation DOM, focus, pending controls
          +--> task-history.ts   ephemeral workflow history
          +--> layout.ts         measured viewport/keyboard/chrome clearance
```

`flow-ui.ts` and `information.ts` retain compatibility exports, but there is only
one implementation of each stateless primitive. Existing data-action/data-flow,
field names and credential-status markers stay stable.

The design system **does not** own backend effects, authentication, workspace
state, form validation policy, host normalization or credential readiness. Those
remain with existing owners. `body` arguments accept trusted product-composed
HTML; all ordinary text/keys are escaped. The legacy field `attrs` argument is
for trusted static attribute markup only, never unescaped user input.

## Foundations

### Typography

All text roles use rem so browser text enlargement scales them consistently.

| Token | Normal size | Purpose |
| --- | ---: | --- |
| `--mh-type-page` | 34px | Top-level page title |
| `--mh-type-detail`, `--mh-type-editor` | 26px | Object/task title |
| `--mh-type-body`, `--mh-type-value` | 17px | Body text, field and information values |
| `--mh-type-control` | 15px | Compact commands, Back, trailing navigation values, Return identity |
| `--mh-type-secondary`, `--mh-type-label` | 13px | Labels and supporting explanation |
| `--mh-type-navigation` | 11px | Compact dock labels only |

System sans-serif is the UI font. The existing licensed Hack Nerd Font Mono is
used for technical/code text. Do not shrink content to make it fit; wrap and scroll.

### Spacing and shape

`--mh-space-1` … `--mh-space-7` are **4, 8, 12, 16, 20, 24, 32px**.
Shared radius roles cover grouped surfaces, fields, buttons, confirmations and
pills. `--mh-target` is **44px**. Recipe-specific icon art and overview geometry
are local details, not a proliferation of public theme variables.

### Colors and materials

Use semantic roles, not screen-specific hex values:

- Canvas and surface: `--mh-canvas`, `--mh-surface`
- Text hierarchy: `--mh-text`, `--mh-muted`
- Actions versus selection: `--mh-action`, `--mh-action-fill`,
  `--mh-on-action`, `--mh-action-subtle`, `--mh-selected`
- Feedback: `--mh-positive`, `--mh-danger`, `--mh-warning`,
  `--mh-warning-background`
- Controls: `--mh-field-background`, `--mh-field-line`, switch on/off/thumb/line
- Chrome: `--mh-material`, `--mh-scrim`, named shadow roles

Dark appearance and increased contrast change tokens. Reduced motion changes the
motion token; reduced transparency and forced colors have explicit recipes.
Selection color is not a shortcut for styling a primary action. Positive tone
must not make an uncommitted review look already applied.

Positive status text (Running and Connected) uses `--mh-positive`: light
`#1c7835` gives 5.54:1 on the white surface and 4.94:1 on canvas. Dark
`#65d881` retains 8.26:1 on surface and 9.84:1 on canvas. Increased contrast
inherits these text colors; switch fills remain separate `--mh-switch-on` roles.

### Measured layout is not a theme

`--mh-keyboard-clearance`, dock/toolbar heights, prompt height and visible height
come from `layout.ts`. Never replace them with theme constants or create a second
measurement owner. Task headers and scroll regions must keep controls reachable
above keyboard/safe areas without covering the final content.

## Usage examples

```ts
import { action, field, group, infoRows, listRow } from "./design-system";

const content = group("Workspace", infoRows([
  { label: "Folder", value: workspace.path, mono: true },
  { label: "Status", value: "Running", tone: "positive" },
]));

const options = group("Actions",
  listRow("credentials", "Workspace credentials", "Authentication and signing", "key")
  + action("stop", "Stop workspace", true),
);

// The existing flow owner binds commands and owns validation/effects.
env.page(workspace.displayName, content + options, actions);
env.task("Rename workspace", field("name", "Display name", workspace.displayName), {
  label: "Save",
  run: task => saveValidatedDraft(task),
});
```

`destinationRow` is the shell's tinted-icon navigation recipe and uses data-action.
`listRow` is object navigation and uses data-flow. Neither hides commands in More.
`action` is for immediate commands; the owning flow supplies confirmation when needed.

Commands use explicit `primary`, `secondary` (default), or `destructive` hierarchy:
`action("review", "Review changes", "primary")`. Existing Boolean
destructive arguments remain compatible. A flow's `primaryAction` promotes the
same button in place; promotion does not depend on a bottom toolbar. Prefer one
prominent action, with filled accent background and contrasting label. Secondary
commands have a quieter tinted rounded surface; destructive commands use a red
label and boundary, never automatic primary promotion. Pressed, disabled and focus
states accompany the visual hierarchy. Header Back/Cancel and navigation rows
retain their distinct navigation treatment. Do not use size alone for emphasis.

`rowAction(key, label, destructive?)` is the in-group command row: left-aligned
blue text on the white group surface with an inset hairline above it and no fill,
for commands that live beside navigation rows (Add Credential, Rename display
name). The destructive variant reads red; the owning flow still confirms. Pass
`"action"` as the fourth argument only in the shell overview, which dispatches
`data-action`; flows keep `data-flow`. A flow's `primaryAction` promotes a
standalone `action()` capsule, never a row.

Use `emptyState("folder", "No subfolders", explanation)` for a verified empty
collection, not for loading or failed reads. The shared composition has a
decorative icon, heading and supporting text; operations remain outside it with
their existing owner. The folder picker explains that files are hidden and its
existing Choose button selects this folder. Never call a directory empty based
only on the absence of subfolders, and never duplicate Choose within the message.
On the Repository credentials page, an empty catalog is one quiet
`mh-note mh-empty-row` line above its Add row rather than a full-height composition.

### Settings → Repository credentials

Settings has one Repository credentials destination, with the total catalog count
only after a successful read (including zero). Agent accounts remains a separate,
direct destination. Settings never expands the repository inventory or its
management actions. A full-page detail uses the incumbent Back, object header,
grouped catalog/status rows, Add Credential row, and management destinations for
Credential Tools and Manage workspace credentials. Existing credential sharing
notices and persistent safety details live on that page, unchanged.

Loading, empty and recoverable error states belong to the credential catalog;
they do not block other Settings destinations. Status enrichment updates text
without remounting focused rows or drafts. Back restores the Settings scroll
position; credential editors retain their existing Save/Cancel semantics. Browser
history stores the `repository-credentials` destination and, for children reached
from it, that safe parent identity. Back/Forward restores this parent; direct
child links do not acquire one from an earlier visit. History never stores
credential material or drafts. Earlier overview screenshots showing expanded inventory are
historical evidence, not the current layout authority.

## State and accessibility contract

### Reference flow: Hub → Create Workspace → Review → Outcome

This local recipe refines new-workspace creation, not the whole product or the
Clone editor. Existing folder uses the related recipe below. Keep the incumbent
fonts, icons and tokens.

- **Overview:** resume existing work first. Running/stopped grouping and the
  separate Open/Start and Details actions remain; Add stays after the list.
- **Editor:** group Location & name using native field primitives. Suggest the
  folder name as the display name (at most 64 characters) only until the user
  edits that field; even an explicitly cleared name is never overwritten.
  Parent/folder/display name remain independent drafts.
- **Optional setup:** authentication hosts and signing live in a native
  disclosure, initially closed. Closing, reopening, picker/credential detours
  and review Back retain configuration, disclosure state and consent. Invalid
  optional values reopen it. Complete incumbent safety facts remain outside
  and before those controls, never hidden by this disclosure.
- **Consent:** Git initialization and Start remain outside optional setup,
  unchecked by default. Review validates without creating anything. No added
  automatic Start or credential assignment accompanies a suggested name.
- **Review:** show the exact destination, display identity, folder/Git effect,
  explicit initialization authorization, stopped/requested-start consequence,
  and exact authentication host/credential and signing choices. Confirm is
  **Create stopped** or **Create and start**. Back edits the same draft.
- **Outcome:** saved registration is not runtime evidence. Read current workspace
  state before offering **Open workspace** when running or **Start workspace**
  when stopped. Both use the existing guarded Hub command owner, including
  unassigned confirmation, credential readiness/unlock and authentication fences.
  Details is secondary. Unknown/read failures expose Retry, not guessed state;
  failed/partial mutations retain the existing recovery and reconciliation paths.

The extra current-state read deliberately trades a brief loading state for a
truthful next action. This recipe is verified in the synthetic harness, not a
claim of live-backend or whole-product validation.

### Reference flow: Hub → Existing folder → Review → Outcome

- **Location & name:** show the exact selected Hub path as selectable information,
  beside Choose another folder and the editable display name. There is no folder
  creation or rename field. Suggest the folder basename, capped at 64 characters,
  until the user edits the display name; an explicit empty edit also belongs to
  the user. A different selection updates only an unedited suggestion.
- **Picker detours:** Cancel or browser Back returns to the same editor with its
  identity, optional configuration, disclosure state and consents. Choosing a
  different folder refreshes the existing registration/repository facts and
  clears Git-init consent: authorization is specific to the selected location.
  Already registered folders retain the incumbent Details destination.
- **Optional setup:** reuse the native credentials disclosure, initially closed,
  with complete safety information outside and before it. Authentication hosts
  and signing survive closed/reopened states and review Back. Review reopens
  invalid optional fields with their current error. Start remains outside the
  disclosure and unchecked by default.
- **Repository effects:** keep the existing folder detection and explicit Git-init
  guard. A known nonrepository requires consent; unknown status leaves backend
  validation authoritative. Existing repositories request no initialization.
  Review itself neither writes files nor registers or starts anything.
- **Review:** show the exact selected path and display identity once, no folder
  creation/rename, Git-init authorization, requested session effect and exact
  credential choices (including None). Confirm is **Add stopped** or **Add and
  start**. Back edits the same draft.
- **Outcome:** reuse the current-state read and guarded Open/Start owner above;
  Details is secondary. Registration is not proof of a running session. Pending,
  rejected, indeterminate and partial results keep the existing single-dispatch,
  reconciliation and retained-folder recovery owners, never an automatic retry,
  duplicate registration or fallback folder creation.

The synthetic existing-folder reference suite exercises this recipe. It does
not establish live-backend or universal browser validation.

- Rendering a primitive emits no change events and performs no storage/network work.
- Switches and radio selections remain drafts until the existing Save/Review/Apply.
- Clone keeps optional post-setup authentication/hosts and signing in a native
  disclosure. Closing it preserves its values; invalid assignments reopen it on
  Review. One-time clone identity, credential safety information and explicit
  Start consent remain outside it. Add another authentication host stays hidden
  until an enabled authentication credential is selected.
- Editor entry focuses a noninteractive heading, never a field or native picker.
- Only centered confirmations trap Tab. Underlying views are inactive during tasks.
- Pending Back cannot reopen a resubmittable editor or lose its operation result.
- Cancel/back clears secret controls at the established lifetime points; no secrets
  or drafts enter history. Forward does not replay an expired operation.
- Use native disabled/checked semantics, visible keyboard focus and text feedback.
- Mark invalid fields and explain the error; never convey state by color alone.
- Read-only metadata and hidden-view enrichment do not acquire mutation ownership.
- Full-page forms, long values, 200% text and constrained viewports must remain usable.
- Canceling a whole creation task returns to Add Workspace; do not add a redundant
  configure landing page. Nested picker Cancel and review Back keep the draft and
  its task-history ownership. Devices has one entry inside Session Security, with
  contextual Back and a truthful count, not a duplicate Settings overview entry.

## Adding a pattern

### Folder selection is not folder management

Use `createFolderPicker` for choosing a directory on the **remote Hub**. It uses
the shared full-page TaskView with fixed Cancel/current-folder/Choose navigation
and a single scrolling folder body. Directory rows navigate; only Choose returns
the verified current path. Choose is disabled during loading/error; Cancel stays
available. Full paths remain readable/selectable even when a long header title
uses ellipsis. The underlying Hub dock is inactive, not a competing destination.

The picker has only a `browseFolders` backend capability. Do not add workspace
creation, registration, rename or delete commands to it. Those stay in **Add
Workspace → Manage folders**, with the existing safeguards and direct actions.
Manual path entry remains in calling editors or management. Don't invent Files
favorites/search/locations that the Hub API doesn't supply, and don't invoke an
iPhone file picker for a server-side folder.

The reference catalog's **Choose Hub folder** example uses this actual module
with a static, test-owned directory tree and no real filesystem requests.

### Extension discipline

1. Choose the existing semantic primitive first. Do not paste a local replacement.
2. Put reused visual decisions in tokens; put one authoritative recipe in styles.
3. Keep domain policy and lifecycle with their current owners.
4. If a genuinely new pattern is needed, add its real caller and reference example
   together. Do not add a hypothetical renderer registry or dependency.
5. Test escaping, meaning/roles, relevant states and the actual flow—not merely
   element presence or a screenshot capture.

The reference catalog is under `tests/mobile-hub-review/design-system*` and is
separately bundled/served. It must never enter the shipping viewport bundle.
Existing optical/reference captures are evidence, not automatically approved goldens.

## Guidance

Inspired by Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/),
especially [Settings](https://developer.apple.com/design/human-interface-guidelines/settings),
[Labels](https://developer.apple.com/design/human-interface-guidelines/labels),
[Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles),
[Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields),
and [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback).
Button hierarchy follows [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons);
empty-state composition adapts [UIContentUnavailableConfiguration](https://developer.apple.com/documentation/uikit/uicontentunavailableconfiguration).
The project-specific research and explicit user decisions remain in the current
change's review evidence. No proprietary symbol/font package is introduced.
