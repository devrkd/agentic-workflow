#!/usr/bin/env sh
# Start a headless opencode server with the Slack bridge enabled, then print
# how to watch its sessions live from another terminal.
#
# Usage: scripts/slack-server.sh [port]
set -e

PORT="${1:-4096}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "warning: .env not found in $ROOT; the Slack bridge will stay disabled" >&2
fi

printf 'opencode server starting on http://127.0.0.1:%s\n' "$PORT"
printf 'watch progress in another terminal with:\n'
printf '  opencode attach http://127.0.0.1:%s\n\n' "$PORT"

exec opencode serve --port "$PORT" --print-logs
