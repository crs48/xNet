# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++

# Copy workspace root for pnpm workspace resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/hub/package.json packages/hub/
COPY packages/abuse/package.json packages/abuse/
COPY packages/cloud-plans/package.json packages/cloud-plans/
COPY packages/core/package.json packages/core/
COPY packages/crypto/package.json packages/crypto/
COPY packages/data/package.json packages/data/
COPY packages/identity/package.json packages/identity/
COPY packages/sqlite/package.json packages/sqlite/
COPY packages/storage/package.json packages/storage/
COPY packages/sync/package.json packages/sync/
COPY packages/telemetry/package.json packages/telemetry/

# Copy patches for pnpm
COPY patches/ patches/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile --filter @xnetjs/hub...

# Copy source
COPY packages/hub/ packages/hub/
COPY packages/abuse/ packages/abuse/
COPY packages/cloud-plans/ packages/cloud-plans/
COPY packages/core/ packages/core/
COPY packages/crypto/ packages/crypto/
COPY packages/data/ packages/data/
COPY packages/identity/ packages/identity/
COPY packages/sqlite/ packages/sqlite/
COPY packages/storage/ packages/storage/
COPY packages/sync/ packages/sync/
COPY packages/telemetry/ packages/telemetry/
COPY tsconfig.json ./

# Build hub + dependencies
RUN pnpm --filter @xnetjs/hub... build

# --- Runtime Stage ---
FROM node:22-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY --from=builder /build/pnpm-lock.yaml /build/pnpm-workspace.yaml /build/package.json ./
COPY --from=builder /build/packages/hub/package.json packages/hub/
COPY --from=builder /build/packages/abuse/package.json packages/abuse/
COPY --from=builder /build/packages/cloud-plans/package.json packages/cloud-plans/
COPY --from=builder /build/packages/core/package.json packages/core/
COPY --from=builder /build/packages/crypto/package.json packages/crypto/
COPY --from=builder /build/packages/data/package.json packages/data/
COPY --from=builder /build/packages/identity/package.json packages/identity/
COPY --from=builder /build/packages/sqlite/package.json packages/sqlite/
COPY --from=builder /build/packages/storage/package.json packages/storage/
COPY --from=builder /build/packages/sync/package.json packages/sync/
COPY --from=builder /build/packages/telemetry/package.json packages/telemetry/

# Copy patches for pnpm
COPY --from=builder /build/patches/ patches/

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && corepack enable \
  # The "..." filter suffix is required: it installs the dependencies of every
  # workspace package in hub's closure (e.g. yjs for @xnetjs/data), not just
  # hub's own. A bare "--filter @xnetjs/hub" only symlinks the workspace
  # packages and leaves their dependencies missing, crashing the hub on boot.
  && corepack pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@xnetjs/hub..." \
  # Keep the runtime image on patched Hono releases without auto-installing optional peer stacks like expo-sqlite.
  && corepack pnpm add @hono/node-server@1.19.10 hono@4.12.4 --prod --ignore-scripts --config.auto-install-peers=false --filter @xnetjs/hub \
  && corepack pnpm --filter @xnetjs/hub exec npm rebuild better-sqlite3 \
  && apk del .build-deps \
  && rm -rf /root/.cache/node/corepack /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx

# Copy built artifacts
COPY --from=builder /build/packages/hub/dist packages/hub/dist/
COPY --from=builder /build/packages/abuse/dist packages/abuse/dist/
COPY --from=builder /build/packages/cloud-plans/dist packages/cloud-plans/dist/
COPY --from=builder /build/packages/core/dist packages/core/dist/
COPY --from=builder /build/packages/crypto/dist packages/crypto/dist/
COPY --from=builder /build/packages/data/dist packages/data/dist/
COPY --from=builder /build/packages/identity/dist packages/identity/dist/
COPY --from=builder /build/packages/sqlite/dist packages/sqlite/dist/
COPY --from=builder /build/packages/storage/dist packages/storage/dist/
COPY --from=builder /build/packages/sync/dist packages/sync/dist/
COPY --from=builder /build/packages/telemetry/dist packages/telemetry/dist/

# ── Litestream (pinned; exploration 0178) — SQLite WAL replication to R2 ──
# Only activated at runtime when LITESTREAM=1 with a config present; self-host and
# the Railway demo (which overrides startCommand) ignore it. v0.5.6/0.5.7 carry a
# silent-replication bug (#1083) — stay on a known-good pin.
ARG LITESTREAM_VERSION=0.5.3
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates \
  && wget -qO /tmp/litestream.tar.gz \
     "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz" \
  && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz litestream \
  && rm /tmp/litestream.tar.gz
COPY packages/hub/litestream-entrypoint.sh /usr/local/bin/xnet-entrypoint.sh
RUN chmod +x /usr/local/bin/xnet-entrypoint.sh

# Create data directory (Railway volume mount will override, but useful for local)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV HUB_DATA_DIR=/data

# Default port for local Docker runs (Railway overrides via startCommand)
ENV PORT=4444

EXPOSE 4444

# Run as root to allow writing to Railway-mounted volumes
# (Railway mounts volumes as root-owned)

# Entrypoint runs the hub directly, or under Litestream when LITESTREAM=1.
# Railway uses startCommand from railway.toml and bypasses this.
CMD ["/usr/local/bin/xnet-entrypoint.sh"]
