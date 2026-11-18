#!/bin/bash
# Standalone source checkout bootstrap. Never touches an installed workspace.
set -euo pipefail
ECU_REPO="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
cd "$ECU_REPO"
if [ "$(uname -s)" != Darwin ]; then echo '此入口用于 Mac。其他系统请运行 npm ci、npm run dev:setup、npm run dev。'; exit 1; fi
if [ "$(id -u)" = 0 ]; then echo '请使用当前 Mac 登录用户运行，不要使用 sudo。'; exit 1; fi
if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 14 ]; then echo '需要 macOS 14 或更新系统。'; exit 1; fi
ECU_NODE_VERSION="$(tr -d '\r\n' < .node-version)"
ECU_ARCH=x64
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then ECU_ARCH=arm64; fi
ECU_RUNTIME="$ECU_REPO/.dev/node-v$ECU_NODE_VERSION-darwin-$ECU_ARCH"
if command -v node >/dev/null 2>&1 && node -e 'const v=process.versions.node.split(".").map(Number);process.exit(v[0]===24&&v[1]>=15&&process.arch===process.argv[1]?0:1)' "$ECU_ARCH"; then
  ECU_NODE="$(command -v node)"
elif [ -x "$ECU_RUNTIME/bin/node" ]; then
  ECU_NODE="$ECU_RUNTIME/bin/node"
else
  mkdir -p "$ECU_REPO/.dev/cache"
  ECU_ARCHIVE="node-v$ECU_NODE_VERSION-darwin-$ECU_ARCH.tar.gz"
  ECU_BASE="https://nodejs.org/dist/v$ECU_NODE_VERSION"
  echo '准备开发环境：下载并校验 Node.js，仅保存在本仓库 .dev 中…'
  curl -fLSs --retry 2 --connect-timeout 20 --max-time 240 "$ECU_BASE/SHASUMS256.txt" -o "$ECU_REPO/.dev/cache/SHASUMS256.txt"
  ECU_EXPECTED="$(awk -v name="$ECU_ARCHIVE" '$2==name {print $1}' "$ECU_REPO/.dev/cache/SHASUMS256.txt")"
  if [ "${#ECU_EXPECTED}" != 64 ]; then echo '无法取得官方校验值，已停止。'; exit 1; fi
  ECU_DOWNLOAD="$ECU_REPO/.dev/cache/$ECU_ARCHIVE"
  if [ ! -f "$ECU_DOWNLOAD" ] || [ "$(shasum -a 256 "$ECU_DOWNLOAD" | awk '{print $1}')" != "$ECU_EXPECTED" ]; then
    curl -fLSs --retry 2 --connect-timeout 20 --max-time 600 "$ECU_BASE/$ECU_ARCHIVE" -o "$ECU_DOWNLOAD"
  fi
  if [ "$(shasum -a 256 "$ECU_DOWNLOAD" | awk '{print $1}')" != "$ECU_EXPECTED" ]; then echo 'Node.js 校验失败，请重新运行。'; exit 1; fi
  ECU_UNPACK="$(mktemp -d "$ECU_REPO/.dev/cache/unpack.XXXXXX")"
  tar -xzf "$ECU_DOWNLOAD" -C "$ECU_UNPACK"
  # A failed prior bootstrap is preserved, never recursively deleted.
  if [ -e "$ECU_RUNTIME" ]; then mv "$ECU_RUNTIME" "$ECU_RUNTIME.incomplete.$(date +%s)"; fi
  mv "$ECU_UNPACK/node-v$ECU_NODE_VERSION-darwin-$ECU_ARCH" "$ECU_RUNTIME"
  ECU_NODE="$ECU_RUNTIME/bin/node"
fi
export PATH="$(dirname "$ECU_NODE"):$PATH"
ECU_LOCK="$(shasum -a 256 package-lock.json | awk '{print $1}')"
ECU_ENV_KEY="$ECU_LOCK-$ECU_ARCH-$(node --version)"
mkdir -p .dev
if [ ! -f node_modules/tsx/dist/cli.mjs ] || [ ! -f .dev/dependencies-key ] || [ "$(cat .dev/dependencies-key)" != "$ECU_ENV_KEY" ]; then
  echo '安装本机开发依赖，请勿从 Windows 复制 node_modules…'
  npm ci
  printf '%s' "$ECU_ENV_KEY" > .dev/dependencies-key
fi
npm run dev:setup
if [ "${1:-}" = --setup-only ]; then exit 0; fi
exec npm run dev
