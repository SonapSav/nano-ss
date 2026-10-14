#!/usr/bin/env bash
# Back up Blender sources (kept outside the repo, see D-022/D-025 in PROJECT.md)
# to Google Drive with rclone. Files changed or deleted locally are not lost:
# the previous copy is moved to a timestamped folder under "versions/".
#
# Usage: scripts/backup-assets.sh [extra rclone flags, e.g. --dry-run]
set -euo pipefail

ASSETS_DIR="${NANO_SS_ASSETS_DIR:-$HOME/Development/nano-ss-assets}"
REMOTE="${NANO_SS_REMOTE:-nano-ss-drive}"
REMOTE_ROOT="${REMOTE}:nano-ss-assets"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

if [[ ! -d "$ASSETS_DIR" ]]; then
  echo "Assets folder not found: $ASSETS_DIR" >&2
  exit 1
fi

rclone sync "$ASSETS_DIR" "$REMOTE_ROOT/current" \
  --backup-dir "$REMOTE_ROOT/versions/$STAMP" \
  --exclude '*.blend[0-9]*' \
  --progress \
  "$@"
