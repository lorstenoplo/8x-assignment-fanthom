# CAPTURE-TEST.md

Proof that agent prompt/response capture is running automatically in this repo,
per the 8x agent capture setup. Written before any assignment code was built.

## Tool and model

- **Tool:** Claude Code CLI, v2.1.278
- **Model:** `claude-opus-5` (Opus 5, 1M-context variant `opus[1m]`), effort level `medium`
- **Planning vs execution:** the same model does both. There is no planner/executor
  split. If the model is switched mid-build, every log entry carries its own
  `model:` line, so the switch is visible in the log rather than only here.

## Mechanism

Claude Code hooks — an automatic lifecycle mechanism, not a manual step. I confirmed
the event names and payload shapes against the official reference
(https://code.claude.com/docs/en/hooks) rather than going from memory.

Two events are wired:

| Event | Fires | Payload field used |
|---|---|---|
| `UserPromptSubmit` | when a prompt is submitted, before the model sees it | `user_prompt` |
| `Stop` | when the model finishes responding | `last_assistant_message` |

Neither event supports matchers; both fire on every occurrence. Because `Stop`
hands over `last_assistant_message` directly, the log contains the final response
only — no thinking, no tool calls, no intermediate steps, no retries. That is what
the brief asks for, and it falls out of the mechanism rather than being filtered
after the fact.

**Config file changed:** `.claude/settings.json` (project-scoped, committed to the repo)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\"" }] }
    ]
  }
}
```

**Script:** `.claude/hooks/capture.py` — appends to `.agent-logs/<YYYY-MM-DD_HH-MM-SS>_<session-id>.md`,
one file per session, and keeps `total_exchanges` / `last_prompt_time` current in the
frontmatter.

`.agent-logs/` is **not** in `.gitignore`. Logs are committed as work happens,
interleaved with the code they produced.

## Log files the canaries landed in

- Canary 1 — `.agent-logs/2026-09-22_15-32-54_44ebcff7-e967-4bfe-8bb1-a7e5f8868077.md`
- Canary 2 — `.agent-logs/2026-09-22_16-01-55_96c7aa67-e7df-48fe-9e1a-d696eb39459c.md`

Two distinct session ids, two separate files. The second canary was sent from a
fresh session that did not install the hook, which is the point of the test: a hook
that only fires in the session that created it is not installed.

## Canary 1, pasted raw

```
[LOG_ENTRY type=PROMPT num=2 session=44ebcff7]
timestamp: 2026-09-22T15:35:43.351Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, nishanth


[LOG_ENTRY type=RESPONSE num=2 session=44ebcff7]
timestamp: 2026-09-22T15:36:18.106Z
model: claude-opus-5

**Canary 1 landed.** ✅

`.agent-logs/2026-09-22_15-32-54_44ebcff7-e967-4bfe-8bb1-a7e5f8868077.md`

```
```

## Canary 2, pasted raw

Sent from a second, independent Claude Code session.

```
[LOG_ENTRY type=PROMPT num=1 session=96c7aa67]
timestamp: 2026-09-22T16:01:55.184Z
model: unknown



<pasted_content id="5089">
CAPTURE TEST — 8x assignment, nishanth
</pasted_content id="5089">


[LOG_ENTRY type=RESPONSE num=1 session=96c7aa67]
timestamp: 2026-09-22T16:01:57.063Z
model: unknown

Capture test acknowledged — nishanth, 8x assignment. No action taken.
```

## Things that did not work first time

**1. I expected a restart to be needed. It wasn't.**
I told the user that project-scoped `settings.json` hooks only load at session
start, and asked them to relaunch before sending the canary. Wrong: Claude Code
picked up the new hook config mid-session, and it fired on the very next prompt.
Left in because it is the kind of thing worth being wrong about in public.

**2. Entry numbering is offset by one in session 1.**
The first `RESPONSE` in the session-1 log is `num=1`, but its prompt was never
captured — that prompt was submitted before the hook existed. So canary 1 is
`num=2`, not `num=1`. I have deliberately not renumbered it. The gap is the
timestamp of the moment capture went live, and editing it away would be exactly
the tidying the brief warns against.

**3. `model: unknown` in the canary-2 entries.**
The hook payload does not carry the model name, so the script reads it from the
session transcript. In a brand-new session, at the moment the first prompt fires
there is no assistant turn in the transcript yet, and the writer had not flushed
the response by the time the `Stop` hook ran either — so both canary-2 entries
recorded `model: unknown`. Visible in the raw paste above.

Fixed going forward, in two parts: the `Stop` hook now waits briefly for the
transcript to flush, and when a session's own transcript still names no model the
script falls back to the most recent transcript for the same project. A first
version of that fallback returned `<synthetic>` — a placeholder id that also appears
in transcripts — so real model ids are now filtered explicitly.

The already-written `unknown` entries have been left exactly as they were recorded.
Backfilling them would mean editing log entries after the fact.

**4. A dry run preceded the real test.**
Before wiring anything live, synthetic payloads were piped into the script with its
output directed at a scratch directory, to check the frontmatter and both entry
types rendered in the required format. Those dry-run files were never written into
`.agent-logs/`.
