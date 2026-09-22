#!/usr/bin/env python3
"""8x assignment capture hook.

Fires automatically on UserPromptSubmit and Stop (see .claude/settings.json).
Appends the verbatim prompt and the final assistant response for each turn to
.agent-logs/<YYYY-MM-DD_HH-MM-SS>_<session-id>.md . Nothing in between is kept:
no thinking, no tool calls, no intermediate steps.
"""
import json
import os
import re
import sys
import time
import glob
import datetime

PROJECT = "fanthom-clone"
AUTHOR = "lorstenoplo"
TOOL = "claude-code"


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        "%03dZ" % (datetime.datetime.now(datetime.timezone.utc).microsecond // 1000)


def is_real_model(m):
    """Transcripts also carry placeholder ids such as <synthetic>."""
    return bool(m) and not m.startswith("<") and m != "unknown"


def model_from_transcript(path):
    """Last assistant message's model id; hook payload does not carry it."""
    model = None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                m = (rec.get("message") or {}).get("model")
                if is_real_model(m):
                    model = m
    except (IOError, OSError):
        pass
    if not model:
        # Brand-new session: the transcript has no assistant turn yet, or the
        # writer has not flushed it. Fall back to the most recent transcript
        # for this project that does name a model.
        model = model_from_project(path)
    return model or os.environ.get("ANTHROPIC_MODEL") or "unknown"


def model_from_project(path):
    try:
        d = os.path.dirname(path)
        files = sorted(glob.glob(os.path.join(d, "*.jsonl")),
                       key=os.path.getmtime, reverse=True)
    except (IOError, OSError):
        return None
    for f in files[:5]:
        if f == path:
            continue
        try:
            with open(f, "r", encoding="utf-8") as fh:
                for line in reversed(fh.readlines()[-400:]):
                    try:
                        rec = json.loads(line.strip())
                    except ValueError:
                        continue
                    m = (rec.get("message") or {}).get("model")
                    if is_real_model(m):
                        return m
        except (IOError, OSError):
            continue
    return None


def last_assistant_text(path):
    """Fallback when the Stop payload has no last_assistant_message."""
    text = None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                msg = rec.get("message") or {}
                if msg.get("role") != "assistant":
                    continue
                content = msg.get("content")
                if isinstance(content, str):
                    chunk = content
                else:
                    parts = [c.get("text", "") for c in (content or [])
                             if isinstance(c, dict) and c.get("type") == "text"]
                    chunk = "\n".join(p for p in parts if p.strip())
                if chunk and chunk.strip():
                    text = chunk
    except (IOError, OSError):
        pass
    return text or ""


def log_path(logdir, session_id, started):
    hits = sorted(glob.glob(os.path.join(logdir, "*_%s.md" % session_id)))
    if hits:
        return hits[0]
    return os.path.join(logdir, "%s_%s.md" % (started.strftime("%Y-%m-%d_%H-%M-%S"), session_id))


def ensure_header(path, session_id, model, ts):
    if os.path.exists(path):
        return
    short = session_id.split("-")[0]
    header = (
        "---\n"
        "session_id: %s\n"
        "date: %s\n"
        "author: %s\n"
        "model: %s\n"
        "tool: %s\n"
        "project: %s\n"
        "total_exchanges: 0\n"
        "first_prompt_time: %s\n"
        "last_prompt_time: %s\n"
        "---\n\n"
        "# Session Log - %s\n\n"
        "Session: `%s` | Project: `%s` | Author: `%s`\n\n"
        "---\n\n"
    ) % (session_id, ts[:10], AUTHOR, model, TOOL, PROJECT, ts, ts,
         ts[:10], short, PROJECT, AUTHOR)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(header)


def update_frontmatter(path, count, ts):
    with open(path, "r", encoding="utf-8") as fh:
        body = fh.read()
    body = re.sub(r"^total_exchanges: .*$", "total_exchanges: %d" % count, body, count=1, flags=re.M)
    body = re.sub(r"^last_prompt_time: .*$", "last_prompt_time: %s" % ts, body, count=1, flags=re.M)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0

    event = payload.get("hook_event_name", "")
    session_id = payload.get("session_id") or "unknown-session"
    transcript = payload.get("transcript_path") or ""
    cwd = payload.get("cwd") or os.getcwd()
    logdir = os.path.join(cwd, ".agent-logs")
    os.makedirs(logdir, exist_ok=True)

    ts = now_iso()
    model = model_from_transcript(transcript)
    if model == "unknown" and event == "Stop":
        for _ in range(6):
            time.sleep(0.25)
            model = model_from_transcript(transcript)
            if model != "unknown":
                break
    short = session_id.split("-")[0]

    if event == "UserPromptSubmit":
        kind = "PROMPT"
        text = payload.get("user_prompt", payload.get("prompt", ""))
    elif event == "Stop":
        kind = "RESPONSE"
        text = payload.get("last_assistant_message") or last_assistant_text(transcript)
    else:
        return 0

    if not str(text).strip():
        return 0

    path = log_path(logdir, session_id, datetime.datetime.now(datetime.timezone.utc))
    ensure_header(path, session_id, model, ts)

    with open(path, "r", encoding="utf-8") as fh:
        existing = fh.read()
    prompts = existing.count("[LOG_ENTRY type=PROMPT")
    responses = existing.count("[LOG_ENTRY type=RESPONSE")
    num = prompts + 1 if kind == "PROMPT" else max(prompts, responses + 1)

    entry = "[LOG_ENTRY type=%s num=%d session=%s]\ntimestamp: %s\nmodel: %s\n\n%s\n\n\n" % (
        kind, num, short, ts, model, str(text).rstrip())
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(entry)

    update_frontmatter(path, prompts + 1 if kind == "PROMPT" else prompts, ts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
