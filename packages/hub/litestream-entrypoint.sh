#!/bin/sh
# xNet hub entrypoint (exploration 0178).
#
# When LITESTREAM=1 and a config is present, the hub runs under Litestream:
# restore the SQLite DB from R2 on boot, then let Litestream supervise the hub
# (`-exec`) so it flushes the final WAL on shutdown for a near-zero RPO.
# Otherwise (self-host / demo) run plain Node — unchanged behavior.
set -e

DATA_DIR="${HUB_DATA_DIR:-/data}"
PORT="${PORT:-4444}"
CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"
HUB="node packages/hub/dist/cli.js --port ${PORT} --data ${DATA_DIR}"

if [ "$LITESTREAM" = "1" ] && [ -f "$CONFIG" ]; then
  echo "[entrypoint] Litestream enabled — restoring ${DATA_DIR}/hub.db from R2 replica"
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "${DATA_DIR}/hub.db"
  echo "[entrypoint] starting hub under litestream replicate -exec"
  exec litestream replicate -config "$CONFIG" -exec "$HUB"
fi

exec $HUB
