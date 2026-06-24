#!/usr/bin/env sh
set -e

printf 'OK\n'
printf 'branch=%s\n' "$(git rev-parse --abbrev-ref HEAD)"
printf 'commit=%s\n' "$(git rev-parse --short HEAD)"
printf 'date=%s\n'   "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
