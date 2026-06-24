#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/clone-repo-for-analysis.sh --task-id <id> (--repo-url <url> | --owner <o> --repo <n>) [options]

Required:
  --task-id <id>                 Task id for .tmp/<task-id>/repos/

Repo (one of):
  --repo-url <url>               github.com/owner/repo or full git URL
  --owner <owner> --repo <name>  GitHub slug

Options:
  --ref <branch|tag|sha>         Checkout ref (shallow clone uses --branch when looks like branch)
  --root <path>                  Workspace root (default: parent of scripts/)
  -h, --help                     Show this help

Output (stdout):
  clone_path=<absolute-path>
  repo=<owner/repo>
  ref=<resolved-ref-or-empty>
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

normalize_slug_from_url() {
  local url="$1"
  local slug=""
  if [[ "$url" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
    slug="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  elif [[ "$url" =~ gitlab\.com[:/]([^/]+)/([^/.]+) ]]; then
    slug="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  elif [[ "$url" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    slug="$url"
  fi
  printf '%s' "$slug"
}

pick_git_url() {
  local owner="$1"
  local repo="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    printf 'git@github.com:%s/%s.git' "$owner" "$repo"
  else
    printf 'https://github.com/%s/%s.git' "$owner" "$repo"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TASK_ID=""
REPO_URL=""
OWNER=""
REPO_NAME=""
REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id)
      require_value "$1" "${2:-}"
      TASK_ID="$2"
      shift 2
      ;;
    --repo-url)
      require_value "$1" "${2:-}"
      REPO_URL="$2"
      shift 2
      ;;
    --owner)
      require_value "$1" "${2:-}"
      OWNER="$2"
      shift 2
      ;;
    --repo)
      require_value "$1" "${2:-}"
      REPO_NAME="$2"
      shift 2
      ;;
    --ref)
      require_value "$1" "${2:-}"
      REF="$2"
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

SLUG=""
if [[ -n "$REPO_URL" ]]; then
  SLUG="$(normalize_slug_from_url "$REPO_URL")"
  if [[ -n "$SLUG" ]]; then
    OWNER="${SLUG%%/*}"
    REPO_NAME="${SLUG#*/}"
    GIT_URL="$(pick_git_url "$OWNER" "$REPO_NAME")"
  elif [[ "$REPO_URL" =~ ^(git@|https?://|ssh://) ]]; then
    GIT_URL="$REPO_URL"
    if [[ "$REPO_URL" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
      SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    elif [[ "$REPO_URL" =~ :([^/]+)/([^/.]+)\.git$ ]]; then
      SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    fi
  else
    echo "Error: could not parse --repo-url: $REPO_URL" >&2
    exit 1
  fi
elif [[ -n "$OWNER" && -n "$REPO_NAME" ]]; then
  SLUG="$OWNER/$REPO_NAME"
  GIT_URL="$(pick_git_url "$OWNER" "$REPO_NAME")"
else
  echo "Error: provide --repo-url or --owner and --repo" >&2
  usage
  exit 1
fi

if [[ -z "${SLUG:-}" ]]; then
  SLUG="$OWNER/$REPO_NAME"
fi

DIR_NAME="${SLUG//\//-}"
CLONE_ROOT="$ROOT_DIR/.tmp/$TASK_ID/repos"
CLONE_PATH="$CLONE_ROOT/$DIR_NAME"

mkdir -p "$CLONE_ROOT"

if [[ -d "$CLONE_PATH/.git" ]]; then
  git -C "$CLONE_PATH" fetch --depth 1 origin 2>/dev/null || git -C "$CLONE_PATH" fetch origin
  if [[ -n "$REF" ]]; then
    git -C "$CLONE_PATH" checkout "$REF"
  fi
else
  CLONE_ARGS=(--depth 1)
  if [[ -n "$REF" ]]; then
    CLONE_ARGS+=(--branch "$REF")
  fi
  git clone "${CLONE_ARGS[@]}" "$GIT_URL" "$CLONE_PATH"
fi

RESOLVED_REF="$REF"
if [[ -z "$RESOLVED_REF" ]]; then
  RESOLVED_REF="$(git -C "$CLONE_PATH" symbolic-ref --short HEAD 2>/dev/null || git -C "$CLONE_PATH" rev-parse --short HEAD)"
fi

echo "clone_path=$CLONE_PATH"
echo "repo=$SLUG"
echo "ref=$RESOLVED_REF"
