#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/certificatecheck-only-linux" || true
cd "$DIR"
./certificatecheck-only-linux
