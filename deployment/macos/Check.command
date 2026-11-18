#!/bin/bash
source "$(dirname "$0")/common.sh"
if [ "${ECUSTUDIO_REPAIR:-0}" = 1 ]; then
  "$NODE" "$ROOT/runtime/node/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts --no-audit --no-fund
  "$NODE" node_modules/playwright/cli.js install chromium --only-shell
fi
"$NODE" scripts/diagnose-runtime.mjs
if [ "${ECUSTUDIO_DEEP_TEST:-0}" = 1 ]; then "$NODE" scripts/customer-selftest.mjs; "$NODE" scripts/macos-native-selftest.mjs; fi
