#!/bin/bash
set -euo pipefail
SOURCE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
TARGET="${ECUSTUDIO_INSTALL_DIR:-$HOME/Library/Application Support/EcuStudio}"
if [ -f "$SOURCE/data/app.sqlite" ]; then TARGET="$SOURCE"; fi
if [ "$(uname -s)" != Darwin ] || [ "$(id -u)" = 0 ]; then echo '请在 Mac 原登录用户下运行，不要使用 sudo。'; exit 1; fi
if [ ! -f "$TARGET/app/scripts/macos-keychain-check.mjs" ]; then echo '请先运行本包的 Repair-Upgrade.command 更新工作台。'; exit 1; fi
export ECUSTUDIO_DATA_DIR="$TARGET/data"
cd "$TARGET/app"
"$TARGET/runtime/node/bin/node" scripts/macos-keychain-check.mjs
