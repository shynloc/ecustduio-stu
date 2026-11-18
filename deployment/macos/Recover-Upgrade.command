#!/bin/bash
set -euo pipefail
export ECUSTUDIO_RECOVER_UPGRADE=1
bash "$(dirname "$0")/Upgrade.command"
