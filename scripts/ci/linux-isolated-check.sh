#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Only loopback exists in this new network namespace. Keep localhost fixtures
# usable, but prevent all public/private network traffic, including subprocesses
# and native parser workers. Fail closed if namespace creation is unavailable.
# Drop root before running repository code; preserve only tool lookup and home.
exec sudo unshare --net -- bash -c '
  set -euo pipefail
  ip link set dev lo up
  exec runuser -u "$1" -- env -i PATH="$2" HOME="$3" bash "$4" "$5"
' ci "$(id -un)" "$PATH" "$HOME" "$PWD/scripts/ci/offline-checks.sh" "${1:?check mode required}"
