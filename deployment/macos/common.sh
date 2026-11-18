#!/bin/bash
set -euo pipefail
ROOT="$(CDPATH= cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then echo '仅适用于macOS。'; exit 1; fi
NODE="$ROOT/runtime/node/bin/node"
if [ ! -x "$NODE" ]; then echo '运行环境未安装，请先执行Install.command。'; exit 1; fi
export PATH="$ROOT/runtime/node/bin:$PATH"
export ECUSTUDIO_DATA_DIR="$ROOT/data"
export PLAYWRIGHT_BROWSERS_PATH="$ROOT/runtime/browsers"
cd "$ROOT/app"
