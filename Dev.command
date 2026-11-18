#!/bin/bash
set -euo pipefail
ECU_REPO="$(CDPATH= cd "$(dirname "$0")" && pwd)"
exec bash "$ECU_REPO/scripts/mac-dev.sh"
