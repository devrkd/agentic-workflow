#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/new-worktree.sh --task-id <id> --role <architect|developer> [options]

Required:
  --task-id <id>                 Task identifier used for paths and branch names
  --role <architect|developer>   Agent role

Options:
  --repo-name <name>             Canonical clone folder name under .repos/
  --repo-url <url>               Remote URL to clone when canonical clone is missing
  --base-ref <ref>               Base ref for new branch (default: origin/main)
  --branch <name>                Override generated branch name
  --timestamp <value>            Override timestamp used in names
  --root <path>                  Root directory containing .repos and .worktrees
  -h, --help                     Show this help message

Examples:
  scripts/new-worktree.sh --task-id RTD-541 --role architect --repo-name my-app --repo-url git@github.com:org/my-app.git
  scripts/new-worktree.sh --task-id RTD-541 --role developer --repo-name my-app
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    echo "Error: $flag requires a value" >&2
    exit 1
  fi
}

infer_repo_name_from_url() {
  local url="$1"
  local name
  name="${url##*/}"
  name="${name%.git}"
  printf '%s' "$name"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TASK_ID=""
ROLE=""
REPO_NAME=""
REPO_URL=""
BASE_REF="origin/main"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
BRANCH_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id)
      require_value "$1" "${2:-}"
      TASK_ID="$2"
      shift 2
      ;;
    --role)
      require_value "$1" "${2:-}"
      ROLE="$2"
      shift 2
      ;;
    --repo-name)
      require_value "$1" "${2:-}"
      REPO_NAME="$2"
      shift 2
      ;;
    --repo-url)
      require_value "$1" "${2:-}"
      REPO_URL="$2"
      shift 2
      ;;
    --base-ref)
      require_value "$1" "${2:-}"
      BASE_REF="$2"
      shift 2
      ;;
    --branch)
      require_value "$1" "${2:-}"
      BRANCH_OVERRIDE="$2"
      shift 2
      ;;
    --timestamp)
      require_value "$1" "${2:-}"
      TIMESTAMP="$2"
      shift 2
      ;;
    --root)
      require_value "$1" "${2:-}"
      ROOT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TASK_ID" ]]; then
  echo "Error: --task-id is required" >&2
  usage
  exit 1
fi

if [[ "$ROLE" != "architect" && "$ROLE" != "developer" ]]; then
  echo "Error: --role must be one of: architect, developer" >&2
  usage
  exit 1
fi

if [[ -z "$REPO_NAME" && -n "$REPO_URL" ]]; then
  REPO_NAME="$(infer_repo_name_from_url "$REPO_URL")"
fi

if [[ -z "$REPO_NAME" ]]; then
  echo "Error: provide --repo-name or --repo-url" >&2
  exit 1
fi

CANONICAL_ROOT="$ROOT_DIR/.repos"
WORKTREE_ROOT="$ROOT_DIR/.worktrees/$TASK_ID"
CANONICAL_REPO="$CANONICAL_ROOT/$REPO_NAME"
WORKTREE_PATH="$WORKTREE_ROOT/$ROLE-$TIMESTAMP"

mkdir -p "$CANONICAL_ROOT"
mkdir -p "$WORKTREE_ROOT"

if [[ ! -d "$CANONICAL_REPO/.git" ]]; then
  if [[ -z "$REPO_URL" ]]; then
    echo "Error: canonical clone missing at $CANONICAL_REPO and no --repo-url provided" >&2
    exit 1
  fi
  git clone "$REPO_URL" "$CANONICAL_REPO"
fi

if [[ -n "$REPO_URL" ]]; then
  CURRENT_ORIGIN="$(git -C "$CANONICAL_REPO" remote get-url origin 2>/dev/null || true)"
  if [[ -n "$CURRENT_ORIGIN" && "$CURRENT_ORIGIN" != "$REPO_URL" ]]; then
    echo "Error: origin URL mismatch for $CANONICAL_REPO" >&2
    echo "  current: $CURRENT_ORIGIN" >&2
    echo "  wanted : $REPO_URL" >&2
    exit 1
  fi
fi

git -C "$CANONICAL_REPO" fetch origin --prune

if [[ -n "$BRANCH_OVERRIDE" ]]; then
  BRANCH_NAME="$BRANCH_OVERRIDE"
else
  BRANCH_NAME="agent/$TASK_ID/$ROLE"
fi

if git -C "$CANONICAL_REPO" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  BRANCH_NAME="$BRANCH_NAME-$TIMESTAMP"
fi

if [[ -e "$WORKTREE_PATH" ]]; then
  echo "Error: worktree path already exists: $WORKTREE_PATH" >&2
  exit 1
fi

git -C "$CANONICAL_REPO" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_REF"

echo "canonical_repo=$CANONICAL_REPO"
echo "worktree_path=$WORKTREE_PATH"
echo "branch_name=$BRANCH_NAME"
echo "role=$ROLE"
echo "task_id=$TASK_ID"
