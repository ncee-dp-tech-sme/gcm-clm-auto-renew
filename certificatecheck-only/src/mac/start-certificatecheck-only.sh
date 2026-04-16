#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/certificatecheck-only-macos" || true
cd "$DIR"
./certificatecheck-only-macos
