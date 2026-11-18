#!/bin/bash
set -euo pipefail
SOURCE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then echo '请在macOS上运行此安装器。'; exit 1; fi
if [ "$(id -u)" = 0 ]; then echo '请以普通Mac登录用户运行，不要使用sudo；凭证需要保存在该用户的钥匙串。'; exit 1; fi
major="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$major" -lt 14 ]; then echo '此版本目标为macOS 14或更新系统。'; exit 1; fi
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; else arch=x64; fi
TARGET="${ECUSTUDIO_INSTALL_DIR:-$HOME/Library/Application Support/EcuStudio}"
if [ -f "$TARGET/data/app.sqlite" ]; then
  export ECUSTUDIO_INSTALL_DIR="$TARGET"
  exec bash "$SOURCE/Upgrade.command"
fi
mkdir -p "$TARGET"
TARGET="$(CDPATH= cd "$TARGET" && pwd)"
if [ "$TARGET" = / ] || [ "$TARGET" = "$HOME" ] || [ "$TARGET" = "$HOME/Library" ]; then echo '请指定独立的应用安装目录。'; exit 1; fi
if [ -f "$TARGET/app/scripts/macos-service.mjs" ] && [ -x "$TARGET/runtime/node/bin/node" ]; then "$TARGET/runtime/node/bin/node" "$TARGET/app/scripts/macos-service.mjs" stop || true; fi
mkdir -p "$TARGET/runtime" "$TARGET/data/setup-cache"
chmod 700 "$TARGET/data" "$TARGET/data/setup-cache"
NODE="$TARGET/runtime/node/bin/node"
need_node=1
if [ -x "$NODE" ]; then
  if "$NODE" -e 'if(process.versions.node!=="24.15.0"||process.arch!==process.argv[1])process.exit(1)' "$arch"; then need_node=0; fi
fi
if [ "$need_node" = 1 ]; then
  name="node-v24.15.0-darwin-$arch.tar.gz"
  cache="$TARGET/data/setup-cache"
  echo "下载并校验官方Node运行环境（$arch）…"
  curl -fLSs --retry 2 --connect-timeout 20 --max-time 240 "https://nodejs.org/dist/v24.15.0/SHASUMS256.txt" -o "$cache/SHASUMS256.txt"
  expected="$(awk -v name="$name" '$2==name {print $1}' "$cache/SHASUMS256.txt")"
  if [ "${#expected}" != 64 ]; then echo '无法读取官方校验值。'; exit 1; fi
  if [ ! -f "$cache/$name" ] || [ "$(shasum -a 256 "$cache/$name" | awk '{print $1}')" != "$expected" ]; then curl -fLSs --retry 2 --connect-timeout 20 --max-time 600 "https://nodejs.org/dist/v24.15.0/$name" -o "$cache/$name"; fi
  if [ "$(shasum -a 256 "$cache/$name" | awk '{print $1}')" != "$expected" ]; then echo 'Node校验失败，已停止安装。'; exit 1; fi
  unpack="$(mktemp -d "$cache/node.XXXXXX")"
  tar -xzf "$cache/$name" -C "$unpack"
  if [ -d "$TARGET/runtime/node" ]; then mv "$TARGET/runtime/node" "$TARGET/runtime/node.previous.$(date +%s)"; fi
  mv "$unpack/node-v24.15.0-darwin-$arch" "$TARGET/runtime/node"
fi
if [ "$SOURCE" != "$TARGET" ]; then
  ditto "$SOURCE/app" "$TARGET/app"
  if [ -d "$SOURCE/docs" ]; then ditto "$SOURCE/docs" "$TARGET/docs"; fi
  for file in "$SOURCE"/*.command "$SOURCE"/*.sh "$SOURCE"/*.md "$SOURCE"/*.html "$SOURCE"/*.mjs; do if [ -f "$file" ]; then cp "$file" "$TARGET/"; fi; done
fi
chmod +x "$TARGET"/*.command "$TARGET"/*.sh "$TARGET/runtime/node/bin/node"
export PATH="$TARGET/runtime/node/bin:$PATH"
export ECUSTUDIO_DATA_DIR="$TARGET/data"
export PLAYWRIGHT_BROWSERS_PATH="$TARGET/runtime/browsers"
cd "$TARGET/app"
echo '安装锁定的生产依赖和PDF浏览器…'
"$NODE" "$TARGET/runtime/node/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts --no-audit --no-fund
"$NODE" node_modules/playwright/cli.js install chromium --only-shell
"$NODE" scripts/diagnose-runtime.mjs
"$NODE" scripts/macos-service.mjs configure
"$NODE" scripts/macos-service.mjs start
echo '安装完成。首次管理员请在这台Mac本机创建，DeepSeek凭证由你自行录入。'
