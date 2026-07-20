# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++

# Copy workspace root for pnpm workspace resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/hub/package.json packages/hub/
COPY packages/abuse/package.json packages/abuse/
COPY packages/billing/package.json packages/billing/
COPY packages/entitlements/package.json packages/entitlements/
COPY packages/core/package.json packages/core/
COPY packages/crypto/package.json packages/crypto/
COPY packages/data/package.json packages/data/
COPY packages/data-bridge/package.json packages/data-bridge/
COPY packages/history/package.json packages/history/
COPY packages/licenses/package.json packages/licenses/
COPY packages/plugins/package.json packages/plugins/
COPY packages/runtime/package.json packages/runtime/
COPY packages/trust/package.json packages/trust/
COPY packages/identity/package.json packages/identity/
COPY packages/slack-compat/package.json packages/slack-compat/
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
COPY packages/billing/ packages/billing/
COPY packages/entitlements/ packages/entitlements/
COPY packages/core/ packages/core/
COPY packages/crypto/ packages/crypto/
COPY packages/data/ packages/data/
COPY packages/data-bridge/ packages/data-bridge/
COPY packages/history/ packages/history/
COPY packages/licenses/ packages/licenses/
COPY packages/plugins/ packages/plugins/
COPY packages/runtime/ packages/runtime/
COPY packages/trust/ packages/trust/
COPY packages/identity/ packages/identity/
COPY packages/slack-compat/ packages/slack-compat/
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
COPY --from=builder /build/packages/billing/package.json packages/billing/
COPY --from=builder /build/packages/entitlements/package.json packages/entitlements/
COPY --from=builder /build/packages/core/package.json packages/core/
COPY --from=builder /build/packages/crypto/package.json packages/crypto/
COPY --from=builder /build/packages/data/package.json packages/data/
COPY --from=builder /build/packages/data-bridge/package.json packages/data-bridge/
COPY --from=builder /build/packages/history/package.json packages/history/
COPY --from=builder /build/packages/licenses/package.json packages/licenses/
COPY --from=builder /build/packages/plugins/package.json packages/plugins/
COPY --from=builder /build/packages/runtime/package.json packages/runtime/
COPY --from=builder /build/packages/trust/package.json packages/trust/
COPY --from=builder /build/packages/identity/package.json packages/identity/
COPY --from=builder /build/packages/slack-compat/package.json packages/slack-compat/
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
COPY --from=builder /build/packages/billing/dist packages/billing/dist/
COPY --from=builder /build/packages/entitlements/dist packages/entitlements/dist/
COPY --from=builder /build/packages/core/dist packages/core/dist/
COPY --from=builder /build/packages/crypto/dist packages/crypto/dist/
COPY --from=builder /build/packages/data/dist packages/data/dist/
COPY --from=builder /build/packages/data-bridge/dist packages/data-bridge/dist/
COPY --from=builder /build/packages/history/dist packages/history/dist/
COPY --from=builder /build/packages/licenses/dist packages/licenses/dist/
COPY --from=builder /build/packages/plugins/dist packages/plugins/dist/
COPY --from=builder /build/packages/runtime/dist packages/runtime/dist/
COPY --from=builder /build/packages/trust/dist packages/trust/dist/
COPY --from=builder /build/packages/identity/dist packages/identity/dist/
COPY --from=builder /build/packages/slack-compat/dist packages/slack-compat/dist/
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
# The v0.5.x release asset is `litestream-<version>-linux-<arch>.tar.gz` — note
# there is NO leading `v` in the filename, and amd64's asset arch is `x86_64`
# (the old `litestream-v<version>-linux-amd64.tar.gz` name 404s — exploration 0196).
RUN apk add --no-cache ca-certificates \
  && case "${TARGETARCH}" in \
       amd64) LS_ARCH=x86_64 ;; \
       arm64) LS_ARCH=arm64 ;; \
       *) LS_ARCH="${TARGETARCH}" ;; \
     esac \
  && wget -q --tries=3 --timeout=30 -O /tmp/litestream.tar.gz \
     "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${LS_ARCH}.tar.gz" \
  && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz litestream \
  && rm /tmp/litestream.tar.gz \
  && litestream version
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
