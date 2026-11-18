#!/bin/bash
set +x
set -euo pipefail
unset ECUSTUDIO_SECRET_INPUT
SOURCE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
TARGET="${ECUSTUDIO_INSTALL_DIR:-$HOME/Library/Application Support/EcuStudio}"
if [ -f "$SOURCE/data/app.sqlite" ]; then TARGET="$SOURCE"; fi
if [ "$(uname -s)" != Darwin ] || [ "$(id -u)" = 0 ]; then echo '请在 Mac 原登录用户下运行，不要使用 sudo。'; exit 1; fi
if [ ! -f "$TARGET/app/scripts/macos-save-deepseek.mjs" ]; then echo '请先运行本包的 Repair-Upgrade.command 更新工作台。'; exit 1; fi
export ECUSTUDIO_DATA_DIR="$TARGET/data"
cd "$TARGET/app"
echo '只保存到此 Mac 的钥匙串，不会发送到外部服务。请先完成工作台中正在运行的任务。'
IFS= read -r -s -p '粘贴 DeepSeek API Key（输入不会显示），然后回车：' ECUSTUDIO_SECRET_INPUT
printf '\n'
printf '%s' "$ECUSTUDIO_SECRET_INPUT" | "$TARGET/runtime/node/bin/node" scripts/macos-save-deepseek.mjs
unset ECUSTUDIO_SECRET_INPUT
