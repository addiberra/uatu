# Spike: what Claude Code reports for running background work

Date: 2026-09-22. Timeboxed (~25 min). Task 0.1 of `fix-workspace-activity-states` (design D9).

- Global CLI: Claude Code 2.1.267 (compiled Bun binary, `/opt/homebrew/Caskroom/claude-code/2.1.267/claude`).
- SDK used by Uatu: `@anthropic-ai/claude-agent-sdk` 0.3.261, bundling `claude-agent-sdk-darwin-arm64` CLI **2.1.261** (also a compiled binary — there is no `cli.js`; the transcripts stamp `"version":"2.1.261"`).
- Method: live probes through the SDK `query()` (auth from the local Claude Code login worked on the first try) plus `grep -a` on the compiled binary and the SDK `.d.ts` files. Probe script and raw frame logs: `/tmp/uatu-spike/{probe.ts,a2,b,c,d,d2}.jsonl` (throwaway, outside the repo).
- Probe options: `model: claude-haiku-4-5`, `permissionMode: bypassPermissions` + `allowDangerouslySkipPermissions`, `perTaskStopAffordance: true`, `agentProgressSummaries: true`, `forwardSubagentText: true`, `includePartialMessages: false`, cwd `/tmp/uatu-spike/work` (a one-commit git repo). The prompt was a **streaming** `AsyncIterable` kept open after the first result (like Uatu's PushQueue); see Surprises for why.

## Q1 — `local_agent`: is `task_started.task_id` the subagent's agentId?

**Yes, for both foreground and backgrounded runs.** `task_id` == `AgentOutput.agentId` == the `<agentId>` in `~/.claude/projects/<cwdSlug>/<sessionId>/subagents/agent-<agentId>.jsonl`. `tool_use_id` on every task frame is the launching `Agent` tool_use's id, and every forwarded subagent frame carries that same id as `parent_tool_use_id`.

Backgrounded (probe b):
```
task_started  task_id=ada2b9582caa230c5 tool_use_id=toolu_013s2jZsDCiw3cAHYTqFeSpc subagent_type=general-purpose
              is_backgrounded=true spawn_depth=1 task_type=local_agent prompt="List the files in the current directory ..."
user/tool_result (tool_use_result): {isAsync:true, status:"async_launched", agentId:"ada2b9582caa230c5", description, resolvedModel,
              prompt, outputFile:"/private/tmp/claude-501/-private-tmp-uatu-spike-work/<sessionId>/tasks/ada2b9582caa230c5.output", canReadOutputFile:true}
assistant/user frames with parent_tool_use_id=toolu_013s2jZs...  (thinking, tool_use Bash, tool_result, text — forwardSubagentText delivered text+thinking)
task_progress task_id=ada2b9582caa230c5 usage{total_tokens:13122,tool_uses:1,duration_ms:4751} last_tool_name=Bash   (no `summary`: run < 30 s)
task_updated  patch{status:"completed",end_time}
task_notification status=completed output_file=<same path> summary="There is **1 file** ..." usage{...}
on disk: ~/.claude/projects/-private-tmp-uatu-spike-work/<sessionId>/subagents/agent-ada2b9582caa230c5.jsonl  (+ .meta.json
         {"agentType":"general-purpose","description":"List files and count them","toolUseId":"toolu_013s2jZs...","spawnDepth":1})
```
Foreground (probe c): `task_started task_id=adcea0e635b291813 is_backgrounded=false`, subagent frames under `parent_tool_use_id`, then `task_updated`/`task_notification` (same `task_id`, `output_file=.../tasks/adcea0e635b291813.output`), then the sync tool_result with `tool_use_result.agentId="adcea0e635b291813"`, `agentType`, `content`, `usage`. Transcript: `.../subagents/agent-adcea0e635b291813.jsonl`. A foreground agent emits **no** `background_tasks_changed`; a backgrounded one is listed there (`task_type: local_agent`).

Agent-task `output_file` is a **symlink** to the subagent transcript: `tasks/<agentId>.output -> ~/.claude/projects/<cwdSlug>/<sessionId>/subagents/agent-<agentId>.jsonl`.

## Q2 — backgrounded `local_bash`: where is the output, and who names it before settle?

**The path is named at launch, in the Bash tool_result text, and is derivable by convention.** It is *not* under `~/.claude`.

```
<tmpRoot>/claude-<uid>/<cwdSlug>/<sessionId>/tasks/<task_id>.output
e.g. /private/tmp/claude-501/-private-tmp-uatu-spike-work/57489e13-.../tasks/bgjpa5uwy.output
```
Evidence (probe a2, tool_use → frames within 10 ms):
```
background_tasks_changed tasks=[{task_id:"bgjpa5uwy", task_type:"local_bash", description:"sleep 25; echo spike-done"}]
task_started  task_id=bgjpa5uwy tool_use_id=toolu_01E1fJ... description="sleep 25; echo spike-done" is_backgrounded=true task_type=local_bash
user/tool_result content: "Command running in background with ID: bgjpa5uwy. Output is being written to:
   /private/tmp/claude-501/-private-tmp-uatu-spike-work/<sessionId>/tasks/bgjpa5uwy.output. You will be notified when it completes.
   To check interim output, use Read on that file path."
   tool_use_result: {stdout:"",stderr:"",interrupted:false,isImage:false,noOutputExpected:false,backgroundTaskId:"bgjpa5uwy"}   <- no path field
... 25 s, NO task_progress for local_bash ...
background_tasks_changed tasks=[]
task_updated  patch{status:"completed",end_time}
task_notification task_id=bgjpa5uwy tool_use_id=... status=completed output_file=<same path> summary="Background command \"sleep 25; echo spike-done\" completed (exit code 0)"
```
Binary (2.1.261) confirms the template: `outputDir = join(bR(), K(), "tasks")` and `outputPath = join(outputDir, `${taskId}.output`)` (function `P7e`, with an `outputPathBindings` override map used only for rerooted/sandboxed tasks), and the launch text is built by `F2t({backgroundTaskId, outputPath, ...})` — the same template also produces "Command did not complete within its Ns timeout and was moved to the background (ID: …). Output is being written to: …" and the "manually backgrounded"/"moved to the background so that a message … can reach you" variants. So: **the structured `BashOutput` carries only `backgroundTaskId`; the path is in the tool_result *text* (parse `Output is being written to: (.+?)\.` ) or reconstructable from `<tmpRoot>/claude-<uid>/<cwdSlug>/<sessionId>/tasks/<task_id>.output`**. The file is a plain text file that already contains interim output while running (`spike-done` + `\n[exited with code 0]` at the end). `task_started`/`task_updated` never name it; `task_notification.output_file` is the only structured carrier.

## Q3 — how `/code-review` runs its work

Partial. `/code-review` is a CLI-bundled skill (not on disk under `~/.claude`; the only extracted bundled skill at `/private/tmp/claude-501/bundled-skills/2.1.267/` is `run`). Sending the literal prompt `/code-review` through the SDK was **not expanded** as a slash command: the model answered "I don't see an explicit task in your message" (probe d, 5 frames, no tasks). A second probe asking the model to call the `Skill` tool with `code-review` (probe d2) is recorded below if it finished inside the timebox.

Probe d2 (model asked to call `Skill` with `code-review`, haiku, a one-line README diff) — **the skill ran as a *forked* agent, not as a task**:
```
assistant tool_use Skill {skill:"code-review"}                                (tool_use_id = toolu_...)
3 assistant + 3 user frames with parent_tool_use_id=<that id>                  (forwarded fork transcript: thinking, Bash `git diff HEAD`, text)
user/tool_result tool_use_result: {success:true, commandName:"code-review", status:"forked", agentId:"aaeeab292f002e3d7", result:"Based on my analysis ..."}
assistant tool_use ReportFindings {count:1, level:"high", findings:[{file:"README.md", line:7, summary:"Function named 'add' implements subtraction ..."}]}
```
No `task_started`, `task_progress`, `task_updated`, `task_notification`, or `background_tasks_changed` frame appeared for the fork or anything inside it; nothing was created under `.../tasks/`. On disk the fork is an ordinary subagent transcript: `~/.claude/projects/<cwdSlug>/<sessionId>/subagents/agent-aaeeab292f002e3d7.jsonl` (+ `.meta.json`). Inside it, at this effort level and diff size, the review ran only foreground `Bash` (`git diff HEAD`) — **no `Agent` launches, no `run_in_background`, no background bash**. So for the default levels `/code-review` contributes to activity only through the normal `running` turn; it produces no background-task rows and no `is_backgrounded`/`subagent_type`/`prompt` task frames. The skill description says the `ultra` level does a "deep multi-agent review in the cloud" (a `remote_launched` AgentOutput / remote task) — not probed. Static check: the binary's printable strings hold only the skill's descriptions ("Review the current diff or a PR for bugs and cleanups", the `/code-review high` level hint, "Run /code-review ultra ... to review these changes in the cloud") and the `ReportFindings` tool text — no readable skill body or agent-launch code — so the live probe is the only evidence for how it runs. Caveat: the SDK-bundled CLI is 2.1.261; a larger diff or a higher effort level may make the forked reviewer spawn foreground `Agent`s, which would then surface as ordinary `local_agent` task frames per Q1.

## Surprises Uatu should know about

1. **Single-string prompts kill background tasks.** With `prompt: "<string>"` the SDK closes the session after the first `result`; the `sleep 25` task was reaped 5 s later as `task_updated patch.status="killed"` + `task_notification status="stopped"` (probe a). Uatu's streaming PushQueue avoids this — the spike switched to a streaming prompt and the task then completed.
2. **The CLI's follow-up turn after a notification starts with a fresh `system/init` frame** (same `session_id`), then assistant text and a second `result`. Both shell and agent completions produced it (~60 ms after `task_notification`).
3. **`local_bash` emits no `task_progress` at all** (25 s run, nothing). `task_progress` was observed only for `local_agent`, once per subagent tool use (`last_tool_name`, cumulative `usage`); no `summary` arrived because the runs were shorter than the ~30 s summary cadence, so the model-written line is unverified here.
4. **`forwardSubagentText: true` works:** subagent `thinking` and `text` blocks arrived as `assistant` frames with `parent_tool_use_id` set, for foreground and backgrounded agents alike; the subagent's `user` tool_result frames also carry `parent_tool_use_id` (their `tool_use_result` was `null`).
5. **The async `AgentOutput` tool_result is complete at launch**: `agentId`, `description`, `prompt`, `resolvedModel`, `outputFile`, `canReadOutputFile`, `isAsync`. The foreground result adds `agentType`, `content`, `usage`, `totalDurationMs`, `totalTokens`, `totalToolUseCount`, and `harness*` fields not in `sdk-tools.d.ts`.
6. **Agent `output_file` is a symlink into `~/.claude/projects/...subagents/agent-<id>.jsonl`**; shell `output_file` is a regular file under `/private/tmp/claude-<uid>/...` (macOS `os.tmpdir()`-style root). Reading through `realpath` lands agents inside the config dir and shells outside it.
7. Task ids: `local_bash` ids are 9-char random (`bgjpa5uwy`), `local_agent` ids are 17-hex (`ada2b9582caa230c5`) = agentId. `background_tasks_changed` fires for backgrounded tasks only (both types) and precedes `task_started` by <2 ms; the empty list precedes `task_updated`/`task_notification`.
8. The foreground agent also gets `task_started` (`is_backgrounded:false`), `task_updated`, and `task_notification` (with `output_file`), matching the normalizer's "foreground so far: keep, show nothing" branch.
9. `rate_limit_event` and `system/thinking_tokens` frames are interleaved everywhere (already ignored by Uatu).

## Recommended adjustments to design D6–D8

- **D8 (confirmed):** `childConversationId` for a `local_agent` task = `sub:<sessionId>:<task_id>` — `task_id` is the agentId for foreground and backgrounded runs, so the provider can learn the child id at `task_started` and keep `tool_use_id → child` for routing frames tagged `parent_tool_use_id`. No need to wait for the tool result. The `.meta.json` beside the subagent transcript (`agentType`, `description`, `toolUseId`, `spawnDepth`) is a second source if ever needed.
- **D6:** keep `subagent_type`, `prompt`, `spawn_depth` from `task_started`; `usage` from `task_progress`/`task_notification`; for shell tasks do **not** expect `task_progress` — elapsed time from `createdAt` is the only live signal, so the row's "progress" line for `local_bash` should be the elapsed readout, not `Using <tool>`.
- **D6/D7 output path:** derive the shell task's `outputFile` at launch from the launching Bash tool_result **text** (`Output is being written to: <path>.`), with the convention `<tmpRoot>/claude-<uid>/<cwdSlug>/<sessionId>/tasks/<task_id>.output` as a fallback; `task_notification.output_file` then only confirms it. The spec's "from the moment Claude Code makes the task's output location known" is therefore effectively "from launch".
- **D7 path guard must change:** "refusing paths outside Claude Code's config directory" would refuse every shell task, because the file lives under the OS temp root, not `~/.claude`. Replace with: accept a path only if it equals the notified/parsed `output_file` for a task that belongs to the conversation AND, after `realpath`, it is under either the CLI's task-output root (`<tmpRoot>/claude-<uid>/<cwdSlug>/<sessionId>/tasks/`) or the config dir's `projects/<cwdSlug>/<sessionId>/subagents/`. Keep the bounded tail; the file already contains interim output while running and ends with `[exited with code N]` on settle.
- **D7 agent tasks:** the agent `output_file` is just the subagent `.jsonl`; the child drill-down already reads it, so no output pane is needed for agents (as designed).
- **Skill forks (D8):** a `Skill` tool result with `status:"forked"` carries an `agentId` whose frames stream under the Skill tool_use's `parent_tool_use_id` but never announce a task; if a live child is wanted for forked skills too, the provider needs the same `tool_use_id → sub:<sessionId>:<agentId>` mapping from that tool result (only available when the fork ends) or a `parent_tool_use_id`-keyed buffer. Out of scope unless the drill-down should cover skill forks.
- **Provider lifecycle:** the `init` frame that opens the CLI's own follow-up turn after a notification must not be treated as a new session/reset (it carries the same `session_id`).
