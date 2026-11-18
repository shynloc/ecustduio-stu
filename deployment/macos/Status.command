#!/bin/bash
source "$(dirname "$0")/common.sh"
"$NODE" scripts/macos-service.mjs status
