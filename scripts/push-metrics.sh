#!/usr/bin/env bash
# Reads a Claude Code Stop/SubagentStop hook payload from stdin, parses the
# session transcript, and writes per-session and per-turn records to SQLite.
#
# Optional env:
#   CLAUDE_METRICS_PROJECT  — project label (default: basename of $PWD)
#   CLAUDE_SESSION_NAME     — override the auto-derived session name
#   CLAUDE_SESSIONS_DB      — SQLite path (default: metrics/data/sessions.db)

set -euo pipefail

PROJECT="${CLAUDE_METRICS_PROJECT:-$(basename "$PWD")}"
CUSTOM_SESSION_NAME="${CLAUDE_SESSION_NAME:-}"
SESSIONS_DB="${CLAUDE_SESSIONS_DB:-metrics/data/sessions.db}"

payload=$(cat)

raw_session_id=$(echo "$payload" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" \
  2>/dev/null || echo "unknown")

transcript_path=$(echo "$payload" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('agent_transcript_path','') or d.get('transcript_path',''))" \
  2>/dev/null || echo "")

if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  transcript_path=$(find ~/.claude/projects -name "${raw_session_id}.jsonl" -type f 2>/dev/null | head -1)
fi

if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  exit 0
fi

python3 - "$transcript_path" "$raw_session_id" "$CUSTOM_SESSION_NAME" "$PROJECT" "$SESSIONS_DB" <<'PYEOF'
import sys, json, sqlite3, os, re
from datetime import datetime
from pathlib import Path

transcript_path, session_id, session_name_override, project, db_path = sys.argv[1:6]

# Tags that Claude Code injects as synthetic "user" messages — not real human input
_SYSTEM_TAG = re.compile(
    r'^\s*<(?:local-command-caveat|local-command-stdout|command-name|command-message|'
    r'command-args|system-reminder|user-prompt-submit-hook|task-notification|'
    r'antml:function_calls|antml:invoke)',
    re.I
)
_CMD_ARGS    = re.compile(r'<command-args>(.*?)</command-args>',    re.DOTALL | re.I)
_CMD_MESSAGE = re.compile(r'<command-message>(.*?)</command-message>', re.DOTALL | re.I)

def _get_texts(msg):
    content = msg.get("content", "")
    if isinstance(content, list):
        return [b.get("text","") for b in content if isinstance(b,dict) and b.get("type")=="text"]
    return [content] if isinstance(content, str) else []

def _extract_human_text(msg):
    for text in _get_texts(msg):
        text = text.strip()
        if text and not _SYSTEM_TAG.match(text):
            return text
    return ""

PRICES = {
    "claude-opus-4":   (15.00, 75.00, 1.50, 18.75),
    "claude-sonnet-4": ( 3.00, 15.00, 0.30,  3.75),
    "claude-haiku-4":  ( 0.80,  4.00, 0.08,  1.00),
    "claude-opus-3":   (15.00, 75.00, 1.50, 18.75),
    "claude-sonnet-3": ( 3.00, 15.00, 0.30,  3.75),
    "claude-haiku-3":  ( 0.25,  1.25, 0.03,  0.30),
}

def calc_cost(inp, out, cr, cw, model):
    price = (3.00, 15.00, 0.30, 3.75)
    for prefix, p in PRICES.items():
        if model.startswith(prefix):
            price = p
            break
    return inp * price[0]/1e6 + out * price[1]/1e6 + cr * price[2]/1e6 + cw * price[3]/1e6

def parse_assistant_turns(path):
    seen_ids = {}
    turns = []
    started_at = ""
    ended_at = ""
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = d.get("timestamp", "")
            if ts:
                if not started_at:
                    started_at = ts
                ended_at = ts
            msg = d.get("message", {})
            if not isinstance(msg, dict) or msg.get("role") != "assistant":
                continue
            msg_id = msg.get("id", "") or f"turn-{len(seen_ids)}"
            u = msg.get("usage") or {}
            entry = {
                "id":      msg_id,
                "ts":      ts,
                "model":   msg.get("model", "unknown"),
                "input":   u.get("input_tokens", 0),
                "output":  u.get("output_tokens", 0),
                "cache_r": u.get("cache_read_input_tokens", 0),
                "cache_w": u.get("cache_creation_input_tokens", 0),
            }
            if msg_id in seen_ids:
                turns[seen_ids[msg_id]] = entry
            else:
                seen_ids[msg_id] = len(turns)
                turns.append(entry)
    return turns, started_at, ended_at

def ensure_tables(con):
    con.executescript("""
CREATE TABLE IF NOT EXISTS sessions (
    id                    TEXT PRIMARY KEY,
    name                  TEXT,
    project               TEXT,
    model                 TEXT,
    started_at            TEXT,
    ended_at              TEXT,
    duration_s            INTEGER,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cache_read_tokens     INTEGER,
    cache_creation_tokens INTEGER,
    cost_usd              REAL,
    turns                 INTEGER,
    first_message         TEXT
);
CREATE TABLE IF NOT EXISTS turns (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT,
    session_name          TEXT,
    project               TEXT,
    model                 TEXT,
    timestamp             TEXT,
    turn_index            INTEGER,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cache_read_tokens     INTEGER,
    cache_write_tokens    INTEGER,
    cost_usd              REAL
);
CREATE TABLE IF NOT EXISTS subagents (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT,
    project               TEXT,
    agent_type            TEXT,
    description           TEXT,
    model                 TEXT,
    started_at            TEXT,
    ended_at              TEXT,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cache_read_tokens     INTEGER,
    cache_creation_tokens INTEGER,
    cost_usd              REAL,
    turns                 INTEGER
);
CREATE TABLE IF NOT EXISTS subagent_turns (
    id                    TEXT PRIMARY KEY,
    agent_id              TEXT,
    session_id            TEXT,
    project               TEXT,
    model                 TEXT,
    timestamp             TEXT,
    turn_index            INTEGER,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cache_read_tokens     INTEGER,
    cache_write_tokens    INTEGER,
    cost_usd              REAL
);
""")

path = Path(transcript_path)

# Detect subagent transcript: .../subagents/agent-<id>.jsonl
is_subagent = path.parent.name == "subagents" and path.stem.startswith("agent-")

os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
con = sqlite3.connect(db_path)
ensure_tables(con)

if is_subagent:
    agent_id   = path.stem                   # agent-a1cb78d3daa134756
    session_id = path.parent.parent.name     # the session UUID directory

    agent_type  = ""
    description = ""
    meta_path = path.with_suffix(".meta.json")
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            agent_type  = meta.get("agentType", "")
            description = meta.get("description", "")
        except Exception:
            pass

    turns, started_at, ended_at = parse_assistant_turns(path)
    if not turns:
        sys.exit(0)

    for i, t in enumerate(turns):
        t["index"] = i
        t["cost"]  = calc_cost(t["input"], t["output"], t["cache_r"], t["cache_w"], t["model"])

    total_input  = sum(t["input"]   for t in turns)
    total_output = sum(t["output"]  for t in turns)
    total_cr     = sum(t["cache_r"] for t in turns)
    total_cw     = sum(t["cache_w"] for t in turns)
    total_cost   = sum(t["cost"]    for t in turns)
    model        = turns[-1]["model"]

    con.execute(
        "INSERT OR REPLACE INTO subagents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (agent_id, session_id, project, agent_type, description, model,
         started_at, ended_at, total_input, total_output, total_cr, total_cw,
         total_cost, len(turns))
    )
    for t in turns:
        con.execute(
            "INSERT OR REPLACE INTO subagent_turns VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (t["id"], agent_id, session_id, project, t["model"], t["ts"],
             t["index"], t["input"], t["output"], t["cache_r"], t["cache_w"], t["cost"])
        )
    con.commit()
    con.close()
    print(f"subagent {agent_id}  |  {agent_type or 'agent'}  |  {len(turns)} turns  |  cost: ${total_cost:.4f}")

else:
    # Normal session transcript
    seen_ids   = {}
    user_uuids = set()
    turns      = []
    first_user_message = ""
    cmd_args_name  = ""
    cmd_slash_name = ""
    user_turn_count = 0
    started_at = ""
    ended_at   = ""

    with open(transcript_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue

            entry_ts = d.get("timestamp", "")
            if entry_ts:
                if not started_at:
                    started_at = entry_ts
                ended_at = entry_ts

            msg = d.get("message", {})
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")

            if role == "user":
                entry_uuid  = d.get("uuid", "")
                parent_uuid = d.get("parentUuid", "") or ""
                is_skill_injection = bool(parent_uuid and parent_uuid in user_uuids)
                if entry_uuid:
                    user_uuids.add(entry_uuid)
                if is_skill_injection:
                    continue

                if not cmd_slash_name:
                    for text in _get_texts(msg):
                        m = _CMD_MESSAGE.search(text)
                        if m:
                            cmd_slash_name = m.group(1).strip()
                        m = _CMD_ARGS.search(text)
                        if m:
                            args = m.group(1).strip()
                            if args:
                                cmd_args_name = " ".join(args.split())[:80]

                human_text = _extract_human_text(msg)
                if human_text:
                    user_turn_count += 1
                    if not first_user_message:
                        human_text = re.sub(r'\s*<attached_files>.*', '', human_text, flags=re.DOTALL).strip()
                        if human_text:
                            first_user_message = " ".join(human_text.split())[:120]

            elif role == "assistant":
                msg_id = msg.get("id", "")
                if msg_id and msg_id in seen_ids:
                    turns[seen_ids[msg_id]] = {
                        "id":        msg_id,
                        "timestamp": entry_ts,
                        "model":     msg.get("model", "unknown"),
                        "input":     (msg.get("usage") or {}).get("input_tokens", 0),
                        "output":    (msg.get("usage") or {}).get("output_tokens", 0),
                        "cache_r":   (msg.get("usage") or {}).get("cache_read_input_tokens", 0),
                        "cache_w":   (msg.get("usage") or {}).get("cache_creation_input_tokens", 0),
                    }
                    continue
                if msg_id:
                    seen_ids[msg_id] = len(turns)
                u = msg.get("usage") or {}
                turns.append({
                    "id":        msg_id or f"{session_id}-{len(turns)}",
                    "timestamp": entry_ts,
                    "model":     msg.get("model", "unknown"),
                    "input":     u.get("input_tokens", 0),
                    "output":    u.get("output_tokens", 0),
                    "cache_r":   u.get("cache_read_input_tokens", 0),
                    "cache_w":   u.get("cache_creation_input_tokens", 0),
                })

    if not turns:
        sys.exit(0)

    for i, t in enumerate(turns):
        t["index"] = i
        t["cost"] = calc_cost(t["input"], t["output"], t["cache_r"], t["cache_w"], t["model"])

    total_input  = sum(t["input"]   for t in turns)
    total_output = sum(t["output"]  for t in turns)
    total_cr     = sum(t["cache_r"] for t in turns)
    total_cw     = sum(t["cache_w"] for t in turns)
    total_cost   = sum(t["cost"]    for t in turns)
    session_model = turns[-1]["model"]

    duration_s = 0
    if started_at and ended_at:
        try:
            def parse_ts(s):
                return datetime.fromisoformat(s.replace("Z", "+00:00"))
            duration_s = max(0, int((parse_ts(ended_at) - parse_ts(started_at)).total_seconds()))
        except Exception:
            pass

    if session_name_override:
        session_name = session_name_override
    elif first_user_message:
        session_name = first_user_message[:80]
    elif cmd_args_name:
        session_name = cmd_args_name
    elif cmd_slash_name:
        session_name = f"/{cmd_slash_name}"
    else:
        session_name = f"session-{session_id[:8]}"

    con.execute(
        "INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (session_id, session_name, project, session_model, started_at, ended_at,
         duration_s, total_input, total_output, total_cr, total_cw, total_cost,
         user_turn_count, first_user_message)
    )
    for t in turns:
        con.execute(
            "INSERT OR REPLACE INTO turns VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (t["id"], session_id, session_name, project, t["model"], t["timestamp"],
             t["index"], t["input"], t["output"], t["cache_r"], t["cache_w"], t["cost"])
        )
    con.commit()
    con.close()
    print(f"wrote {len(turns)} turns  |  session: {session_name!r}  |  cost: ${total_cost:.4f}")
PYEOF
