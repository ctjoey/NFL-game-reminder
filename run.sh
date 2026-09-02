#!/bin/bash
# Linux / macOS terminal: ./run.sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js (LTS) from https://nodejs.org first."; exit 1; }
[ -d node_modules/express ] || npm install --no-audit --no-fund
node launch.js
