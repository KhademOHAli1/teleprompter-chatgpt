#!/bin/bash
# SPDX-License-Identifier: MIT
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v bun >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun 1.4.2 oder neuer installieren: https://bun.sh"
  exit 1
fi
bun install --frozen-lockfile
bun run build
echo "App-Vorschau: http://127.0.0.1:4317"
bun run start
