#!/bin/bash
set -euo pipefail
SOURCE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then echo '请在Mac上运行。'; exit 1; fi
if [ "$(id -u)" = 0 ]; then echo '请使用原Mac登录用户运行，不要使用sudo。'; exit 1; fi
TARGET="${ECUSTUDIO_INSTALL_DIR:-$HOME/Library/Application Support/EcuStudio}"
if [ ! -f "$TARGET/data/app.sqlite" ] || [ ! -f "$TARGET/ecustudio.json" ]; then
  printf '请输入旧版安装文件夹（包含app、data和ecustudio.json，不是新解压文件夹）：'
  IFS= read -r TARGET
fi
if [ ! -f "$TARGET/data/app.sqlite" ] || [ ! -f "$TARGET/app/package.json" ]; then echo '未找到旧安装目录，已停止。'; exit 1; fi
NODE="$TARGET/runtime/node/bin/node"
if [ ! -x "$NODE" ]; then NODE="$(command -v node || true)"; fi
if [ -z "$NODE" ] || ! "$NODE" -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)'; then echo '原安装需要Node 24运行环境，请先修复运行环境。'; exit 1; fi
ARGS=("$SOURCE/upgrade.mjs" --source "$SOURCE" --target "$TARGET")
if [ "${ECUSTUDIO_NO_BROWSER:-0}" = 1 ]; then ARGS+=(--no-browser); fi
if [ "${ECUSTUDIO_RECOVER_UPGRADE:-0}" = 1 ]; then ARGS+=(--recover); fi
echo "旧安装位置：$TARGET"
if [ "${ECUSTUDIO_REPAIR_UPGRADE:-0}" = 1 ] && [ -f "$TARGET/data/upgrade.lock" ]; then
  echo '检测到未完成升级，先恢复原安装，再升级。正在运行的升级会被拒绝，请勿同时操作。'
  "$NODE" "$SOURCE/upgrade.mjs" --source "$SOURCE" --target "$TARGET" --recover --no-browser
fi
"$NODE" "${ARGS[@]}"
echo '操作完成。原有账号、资料、设置与钥匙串凭据保留。'
