## MODIFIED Requirements

### Requirement: The stream carries a bounded activity summary of the user's other workspaces
The stream SHALL deliver an `activity` topic describing, for every workspace the authenticated user may access, whether its session is running and — when running — whether any agent conversation is working, whether any interaction (a permission request, a question) awaits the user, and whether work there has finished without the user having viewed it since. A conversation is working while a turn is in flight or while the agent still holds live background work (a backgrounded command, a backgrounded subagent, a monitor); ambient housekeeping tasks do not count. The summary SHALL update when those facts change and MUST be bounded to those facts: it MUST NOT carry conversation content, titles, file paths, or per-conversation detail. A workspace whose child is unreachable SHALL be reported as not running rather than withheld.

The *finished* fact is held per user. It SHALL become true for a user when a running workspace the hub observed working goes quiet — no conversation working and no interaction awaiting — and SHALL stay true until that user views the workspace's chat, the session stops, or work starts there again. A workspace first seen already quiet (a page opening after the fact, a session that just started) is not finished. Viewing is reported by the user's session page for that workspace when its chat surface is in view; the acknowledgement clears the fact for that user on every device and MUST NOT affect other users. A workspace that is not running is never finished.

#### Scenario: Another workspace's agent finishes
- **WHEN** an agent conversation in a workspace the user is not viewing transitions from working to idle
- **THEN** the user's open session tabs receive an activity update for that workspace reporting it running, not working, and finished

#### Scenario: Background work keeps the workspace working
- **WHEN** a turn ends in another workspace while the agent still holds a backgrounded task
- **THEN** the activity summary for that workspace continues to report it working
- **AND** it reports the workspace finished once the background work is gone and no turn is running

#### Scenario: An interaction awaits the user elsewhere
- **WHEN** an agent in another running workspace asks a question or requests permission
- **THEN** the activity summary for that workspace reports an interaction awaiting the user until it is answered
- **AND** the workspace is not reported finished while the interaction awaits

#### Scenario: Viewing the chat clears finished for that user only
- **WHEN** a workspace is reported finished for two users and one of them opens that workspace's chat on any device
- **THEN** that user's other open pages receive an update with finished cleared
- **AND** the other user's summary still reports the workspace finished

#### Scenario: Stopping or restarting work clears finished
- **WHEN** a workspace reported finished is stopped, or an agent there starts working again
- **THEN** the summary no longer reports it finished

#### Scenario: A quiet workspace seen for the first time is not finished
- **WHEN** a user's first page opens while another workspace is running and idle
- **THEN** that workspace is reported running and idle, not finished

#### Scenario: The summary carries no content
- **WHEN** an activity update is delivered
- **THEN** it contains the workspace identity and running/working/awaiting/finished facts only
