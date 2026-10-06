#!/usr/bin/env bash
# The existing desktop and packaged-app gates need a real Secret Service for
# encrypted settings. Keep the fixture keyring separate from any login keyring.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: with-linux-test-keyring.sh <test command> [arguments...]' >&2
  exit 2
fi

xnet_test_keyring_dir=$(mktemp -d)
trap 'rm -rf "$xnet_test_keyring_dir"' EXIT
export XDG_DATA_HOME="$xnet_test_keyring_dir"
export XDG_CURRENT_DESKTOP=GNOME

dbus-run-session -- bash -euo pipefail -c '
  printf "%s" "xnet-ci-keyring-fixture" |
    gnome-keyring-daemon --unlock --daemonize --components=secrets
  exec "$@"
' xnet-test-keyring "$@"
