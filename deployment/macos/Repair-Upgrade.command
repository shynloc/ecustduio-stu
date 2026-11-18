#!/bin/bash
set -euo pipefail
SOURCE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
echo 'EcuStudio Mac 修复升级：保留原账号、资料和钥匙串配置。'
export ECUSTUDIO_REPAIR_UPGRADE=1
exec bash "$SOURCE/Upgrade.command"
