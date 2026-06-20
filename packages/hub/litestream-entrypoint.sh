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

# Managed hubs (Cloud Run) can't have a config file written into them, so generate
# one from env when none is mounted: LITESTREAM=1, a per-tenant LITESTREAM_PATH, and
# R2 creds (set by the control-plane provisioner). Credentials stay as ${...} refs so
# the rendered file never embeds secrets — Litestream expands them at runtime
# (exploration 0205). A mounted/baked config always wins.
if [ "$LITESTREAM" = "1" ] && [ ! -f "$CONFIG" ] && [ -n "$LITESTREAM_PATH" ] && [ -n "$R2_BUCKET" ]; then
  echo "[entrypoint] generating ${CONFIG} for R2 replication (replica path: ${LITESTREAM_PATH})"
  cat > "$CONFIG" <<YAML
dbs:
  - path: ${DATA_DIR}/hub.db
    replicas:
      - type: s3
        endpoint: \${R2_ENDPOINT}
        bucket: \${R2_BUCKET}
        path: ${LITESTREAM_PATH}
        region: auto
        access-key-id: \${R2_ACCESS_KEY_ID}
        secret-access-key: \${R2_SECRET_ACCESS_KEY}
        sync-interval: 1s
YAML
fi

if [ "$LITESTREAM" = "1" ] && [ -f "$CONFIG" ]; then
  echo "[entrypoint] Litestream enabled — restoring ${DATA_DIR}/hub.db from R2 replica"
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "${DATA_DIR}/hub.db"
  # Telemetry lives in a SEPARATE DB (exploration 0187). Restore it too when the
  # config replicates it — but tolerate its absence: a config that only backs up
  # hub.db (e.g. the managed-hub config generated above) makes litestream exit
  # non-zero with "database not found in config", which `set -e` would turn into a
  # boot crash. Telemetry is operational/ephemeral, so skipping it is fine.
  echo "[entrypoint] restoring ${DATA_DIR}/telemetry.db from R2 replica (if configured)"
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "${DATA_DIR}/telemetry.db" \
    || echo "[entrypoint] telemetry.db not in config — skipping its restore"
  echo "[entrypoint] starting hub under litestream replicate -exec"
  exec litestream replicate -config "$CONFIG" -exec "$HUB"
fi

exec $HUB
