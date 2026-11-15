#!/bin/bash
# Checks GitHub for a newer version every few minutes. The screen reloads itself when one arrives.
cd "$(dirname "$0")" || exit 0
[ -d .git ] || exit 0
git fetch --quiet origin 2>/dev/null || exit 0
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse '@{u}' 2>/dev/null) || exit 0
[ "$LOCAL" = "$REMOTE" ] && exit 0
git reset --hard --quiet "$REMOTE"
# config.json and the saved world in data/ are not part of the download, so they are untouched.
# The server notices when its own file changes and restarts itself; the screen then reloads.
exit 0
