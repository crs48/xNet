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

# Demo hubs enforce per-user quotas + a daily data reset (exploration 0291).
# The config layer also treats HUB_MODE=demo as demo, but pass the flag through
# the Litestream path too so every launch path agrees (Railway overrides this
# start command with its own; this keeps the entrypoint consistent elsewhere).
if [ "$HUB_MODE" = "demo" ] || [ "$HUB_DEMO" = "1" ]; then
  HUB="${HUB} --demo"
fi

# Managed hubs (Cloud Run) can't have a config file written into them, so generate
# one from env when none is mounted: LITESTREAM=1, a per-tenant LITESTREAM_PATH, and
# S3 creds. Credentials stay as ${...} refs so the rendered file never embeds
# secrets — Litestream expands them at runtime (exploration 0205). A mounted/baked
# config always wins.
#
# This is also the SELF-HOST durability path (exploration 0288): point it at ANY
# S3-compatible store, not just R2. The managed control plane sets the R2_* env; a
# self-hoster sets the same env for their own bucket, plus optional overrides for
# non-R2 stores (real AWS S3 wants virtual-hosted style + a concrete region):
#   LITESTREAM_REGION           (default "auto"; use e.g. "us-east-1" for AWS)
#   LITESTREAM_FORCE_PATH_STYLE (default "true"; set "false" for AWS S3)
LS_REGION="${LITESTREAM_REGION:-auto}"
LS_FORCE_PATH_STYLE="${LITESTREAM_FORCE_PATH_STYLE:-true}"
if [ "$LITESTREAM" = "1" ] && [ ! -f "$CONFIG" ] && [ -n "$LITESTREAM_PATH" ] && [ -n "$R2_BUCKET" ]; then
  echo "[entrypoint] generating ${CONFIG} for S3 replication (replica path: ${LITESTREAM_PATH}, region: ${LS_REGION})"
  cat > "$CONFIG" <<YAML
# Localhost metrics — the hub scrapes this for a live backup-freshness signal
# (lastSyncMs on /health; exploration 0288). Bound to loopback so a tenant's
# replication metrics are never publicly reachable.
addr: 127.0.0.1:9090
dbs:
  - path: ${DATA_DIR}/hub.db
    replicas:
      - type: s3
        endpoint: \${R2_ENDPOINT}
        bucket: \${R2_BUCKET}
        path: ${LITESTREAM_PATH}
        region: ${LS_REGION}
        access-key-id: \${R2_ACCESS_KEY_ID}
        secret-access-key: \${R2_SECRET_ACCESS_KEY}
        # R2 needs path-style + signed payloads. Litestream < 0.5.5 defaults
        # sign-payload to false, which 403s R2 with SignatureDoesNotMatch (we pin
        # 0.5.3 — 0.5.6/0.5.7 have a separate replication bug). Set both explicitly.
        # force-path-style is overridable for non-R2 S3 (AWS wants it false).
        force-path-style: ${LS_FORCE_PATH_STYLE}
        sign-payload: true
        sync-interval: 1s
YAML
fi

if [ "$LITESTREAM" = "1" ] && [ -f "$CONFIG" ]; then
  echo "[entrypoint] Litestream enabled — restoring ${DATA_DIR}/hub.db from R2 replica"
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "${DATA_DIR}/hub.db"
  # Telemetry lives in a SEPARATE DB (exploration 0187). Only restore it when the
  # config actually replicates it — restoring a db that isn't in the config makes
  # litestream exit non-zero ("database not found in config"), which `set -e` would
  # turn into a boot crash. The managed-hub config generated above backs up only
  # hub.db, so this is skipped there rather than attempted-and-tolerated — no more
  # relying on a swallowed error to paper over the inconsistency (exploration 0288).
  if grep -q "telemetry.db" "$CONFIG"; then
    echo "[entrypoint] restoring ${DATA_DIR}/telemetry.db from R2 replica"
    litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "${DATA_DIR}/telemetry.db"
  fi
  echo "[entrypoint] starting hub under litestream replicate -exec"
  exec litestream replicate -config "$CONFIG" -exec "$HUB"
fi

exec $HUB
