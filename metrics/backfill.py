#!/usr/bin/env python3
"""
Backfill ~/claude-metrics/sessions.db from all Claude Code JSONL transcripts.
Run once to repair stale session names or rebuild the DB from scratch.

Usage:
    python3 backfill.py            # upsert all sessions (keeps manual edits)
    python3 backfill.py --rebuild  # drop and recreate tables first
"""

import json, sqlite3, os, re, sys, glob
from datetime import datetime
from pathlib import Path

PROJECTS_DIR = Path.home() / ".claude" / "projects"
DB_PATH      = Path.home() / "claude-metrics" / "sessions.db"

PRICES = {
    "claude-opus-4":   (15.00, 75.00, 1.50, 18.75),
    "claude-sonnet-4": ( 3.00, 15.00, 0.30,  3.75),
    "claude-haiku-4":  ( 0.80,  4.00, 0.08,  1.00),
    "claude-opus-3":   (15.00, 75.00, 1.50, 18.75),
    "claude-sonnet-3": ( 3.00, 15.00, 0.30,  3.75),
    "claude-haiku-3":  ( 0.25,  1.25, 0.03,  0.30),
}

_SYSTEM_TAG = re.compile(
    r'^\s*<(?:local-command-caveat|local-command-stdout|command-name|command-message|'
    r'command-args|system-reminder|user-prompt-submit-hook|task-notification|'
    r'antml:function_calls|antml:invoke)',
    re.I
)
_CMD_ARGS    = re.compile(r'<command-args>(.*?)</command-args>',       re.DOTALL | re.I)
_CMD_MESSAGE = re.compile(r'<command-message>(.*?)</command-message>', re.DOTALL | re.I)


def calc_cost(inp, out, cr, cw, model):
    price = (3.00, 15.00, 0.30, 3.75)
    for prefix, p in PRICES.items():
        if model.startswith(prefix):
            price = p
            break
    return inp * price[0]/1e6 + out * price[1]/1e6 + cr * price[2]/1e6 + cw * price[3]/1e6


def get_texts(msg):
    content = msg.get("content", "")
    if isinstance(content, list):
        return [b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"]
    return [content] if isinstance(content, str) else []


def extract_human_text(msg):
    for text in get_texts(msg):
        text = text.strip()
        if text and not _SYSTEM_TAG.match(text):
            return text
    return ""


def parse_transcript(path, session_id, project):
    seen_ids   = {}   # msg_id -> index in turns (keeps last occurrence)
    user_uuids = set()
    turns      = []
    first_human    = ""
    cmd_args_name  = ""
    cmd_slash_name = ""
    user_turn_count = 0
    started_at = ""
    ended_at   = ""

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
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")

            if role == "user":
                uid    = d.get("uuid", "")
                parent = d.get("parentUuid", "") or ""
                is_injection = bool(parent and parent in user_uuids)
                if uid:
                    user_uuids.add(uid)
                if is_injection:
                    continue

                if not cmd_slash_name:
                    for text in get_texts(msg):
                        m = _CMD_MESSAGE.search(text)
                        if m:
                            cmd_slash_name = m.group(1).strip()
                        m = _CMD_ARGS.search(text)
                        if m:
                            a = m.group(1).strip()
                            if a:
                                cmd_args_name = " ".join(a.split())[:80]

                h = extract_human_text(msg)
                if h:
                    user_turn_count += 1
                    if not first_human:
                        # strip trailing attached-file XML so names stay clean
                        h = re.sub(r'\s*<attached_files>.*', '', h, flags=re.DOTALL).strip()
                        if h:
                            first_human = " ".join(h.split())[:120]

            elif role == "assistant":
                msg_id = msg.get("id", "") or f"{session_id}-{len(seen_ids)}"
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
                    # overwrite with latest — Claude emits partials first, final last
                    turns[seen_ids[msg_id]] = entry
                else:
                    seen_ids[msg_id] = len(turns)
                    turns.append(entry)

    if not turns:
        return None

    for i, t in enumerate(turns):
        t["index"] = i
        t["cost"]  = calc_cost(t["input"], t["output"], t["cache_r"], t["cache_w"], t["model"])

    total_input  = sum(t["input"]   for t in turns)
    total_output = sum(t["output"]  for t in turns)
    total_cr     = sum(t["cache_r"] for t in turns)
    total_cw     = sum(t["cache_w"] for t in turns)
    total_cost   = sum(t["cost"]    for t in turns)
    session_model = turns[-1]["model"]
    first_message = first_human

    duration_s = 0
    if started_at and ended_at:
        try:
            def parse_ts(s):
                return datetime.fromisoformat(s.replace("Z", "+00:00"))
            duration_s = max(0, int((parse_ts(ended_at) - parse_ts(started_at)).total_seconds()))
        except Exception:
            pass

    if first_human:
        session_name = first_human[:80]
    elif cmd_args_name:
        session_name = cmd_args_name
    elif cmd_slash_name:
        session_name = f"/{cmd_slash_name}"
    else:
        session_name = f"session-{session_id[:8]}"

    return {
        "session": (
            session_id, session_name, project, session_model,
            started_at, ended_at, duration_s,
            total_input, total_output, total_cr, total_cw,
            total_cost, user_turn_count, first_message
        ),
        "turns": [
            (t["id"], session_id, session_name, project, t["model"],
             t["ts"], t["index"], t["input"], t["output"],
             t["cache_r"], t["cache_w"], t["cost"])
            for t in turns
        ],
    }


def parse_subagent(path, agent_id, session_id, project):
    meta_path = path.with_suffix(".meta.json")
    agent_type  = ""
    description = ""
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            agent_type  = meta.get("agentType", "")
            description = meta.get("description", "")
        except Exception:
            pass

    seen_ids   = {}   # msg_id -> index in turns (keeps last occurrence)
    turns      = []
    started_at = ""
    ended_at   = ""

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

            msg_id = msg.get("id", "") or f"{agent_id}-{len(seen_ids)}"
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

    if not turns:
        return None

    for i, t in enumerate(turns):
        t["index"] = i
        t["cost"]  = calc_cost(t["input"], t["output"], t["cache_r"], t["cache_w"], t["model"])

    model = turns[-1]["model"]
    return {
        "subagent": (
            agent_id, session_id, project, agent_type, description, model,
            started_at, ended_at,
            sum(t["input"]   for t in turns),
            sum(t["output"]  for t in turns),
            sum(t["cache_r"] for t in turns),
            sum(t["cache_w"] for t in turns),
            sum(t["cost"]    for t in turns),
            len(turns),
        ),
        "turns": [
            (t["id"], agent_id, session_id, project, t["model"],
             t["ts"], t["index"], t["input"], t["output"],
             t["cache_r"], t["cache_w"], t["cost"])
            for t in turns
        ],
    }


def project_label(dir_name):
    # "-Users-ramesh-vscode-opencode-agents-claude" → "opencode-agents-claude"
    parts = dir_name.lstrip("-").split("-")
    # drop leading path components (Users, username, vscode / home dir parts)
    # heuristic: skip parts that look like path prefixes (Users, home, vscode, etc.)
    skip = {"users", "home", "vscode", "ramesh", "desktop", "documents", "dev", "code"}
    meaningful = [p for p in parts if p.lower() not in skip]
    return "-".join(meaningful) if meaningful else dir_name


def setup_tables(con, rebuild=False):
    if rebuild:
        con.execute("DROP TABLE IF EXISTS subagent_turns")
        con.execute("DROP TABLE IF EXISTS subagents")
        con.execute("DROP TABLE IF EXISTS turns")
        con.execute("DROP TABLE IF EXISTS sessions")
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


def main():
    rebuild = "--rebuild" in sys.argv
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    setup_tables(con, rebuild=rebuild)

    jsonl_files    = sorted(PROJECTS_DIR.glob("*/*.jsonl"))
    subagent_files = sorted(PROJECTS_DIR.glob("*/*/subagents/agent-*.jsonl"))
    print(f"Found {len(jsonl_files)} session transcripts, {len(subagent_files)} subagent transcripts "
          f"across {len(list(PROJECTS_DIR.iterdir()))} projects")
    if rebuild:
        print("Mode: REBUILD (dropping existing data)")
    else:
        print("Mode: UPSERT (insert or replace)")
    print()

    ok = skipped = errors = 0

    for path in jsonl_files:
        session_id = path.stem
        project    = project_label(path.parent.name)

        try:
            result = parse_transcript(path, session_id, project)
        except Exception as e:
            print(f"  ERROR  {path.name}: {e}")
            errors += 1
            continue

        if result is None:
            skipped += 1
            continue

        name    = result["session"][1]
        cost    = result["session"][11]
        n_turns = len(result["turns"])

        con.execute("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    result["session"])
        for turn in result["turns"]:
            con.execute("INSERT OR REPLACE INTO turns VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", turn)

        print(f"  OK  [{project:30s}]  {n_turns:3d} turns  ${cost:.4f}  {repr(name)}")
        ok += 1

    con.commit()

    print()
    sub_ok = sub_skipped = sub_errors = 0

    for path in subagent_files:
        agent_id   = path.stem                          # agent-a1cb78d3daa134756
        session_id = path.parent.parent.name            # the session UUID directory
        project    = project_label(path.parent.parent.parent.name)

        try:
            result = parse_subagent(path, agent_id, session_id, project)
        except Exception as e:
            print(f"  ERROR  subagent {path.name}: {e}")
            sub_errors += 1
            continue

        if result is None:
            sub_skipped += 1
            continue

        cost    = result["subagent"][12]
        n_turns = result["subagent"][13]
        atype   = result["subagent"][3] or "agent"

        con.execute("INSERT OR REPLACE INTO subagents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    result["subagent"])
        for turn in result["turns"]:
            con.execute("INSERT OR REPLACE INTO subagent_turns VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", turn)

        print(f"  SA  [{project:30s}]  {n_turns:3d} turns  ${cost:.4f}  {atype}: {agent_id}")
        sub_ok += 1

    con.commit()
    con.close()

    print()
    print(f"Sessions:  {ok} written, {skipped} skipped, {errors} errors")
    print(f"Subagents: {sub_ok} written, {sub_skipped} skipped, {sub_errors} errors")
    print(f"DB:        {DB_PATH}")


if __name__ == "__main__":
    main()
