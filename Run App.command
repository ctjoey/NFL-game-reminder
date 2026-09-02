#!/bin/bash
# macOS: double-click this file. (If macOS says it can't be opened, right-click > Open once.)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Opening the download page - install the LTS version, then double-click Run App.command again."
  open https://nodejs.org/en/download
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
[ -d node_modules/express ] || npm install --no-audit --no-fund
node launch.js
