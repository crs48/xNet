#!/bin/sh
set -eu
mkdir -p "$RELAY_DATA_DIR"
chown node:node "$RELAY_DATA_DIR"
exec gosu node node /app/gateway.mjs
