#!/usr/bin/env sh
# Ensures uberdesigner-studio runtime/ (server + built panel) is present in this skill directory.
set -e

SKILL_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUNTIME_DIR="$SKILL_DIR/runtime"

if [ -d "$RUNTIME_DIR/server" ] && [ -d "$RUNTIME_DIR/panel" ]; then
  exit 0
fi

TMP_CLONE="/tmp/uberdesigner-studio-runtime"
rm -rf "$TMP_CLONE"
git clone --depth 1 https://github.com/bogdan239/uberdesigner-studio.git "$TMP_CLONE"
mkdir -p "$RUNTIME_DIR"
cp -R "$TMP_CLONE/runtime/server" "$RUNTIME_DIR/server"
cp -R "$TMP_CLONE/runtime/panel" "$RUNTIME_DIR/panel"
rm -rf "$TMP_CLONE"
echo "Installed uberdesigner-studio runtime into $RUNTIME_DIR"
