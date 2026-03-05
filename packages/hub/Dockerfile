# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++

# Copy workspace root for pnpm workspace resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/hub/package.json packages/hub/
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
  && pnpm install --frozen-lockfile --prod --ignore-scripts --filter @xnetjs/hub... \
  && pnpm --filter @xnetjs/hub exec npm rebuild better-sqlite3 \
  && apk del .build-deps

# Copy built artifacts
COPY --from=builder /build/packages/hub/dist packages/hub/dist/
COPY --from=builder /build/packages/core/dist packages/core/dist/
COPY --from=builder /build/packages/crypto/dist packages/crypto/dist/
COPY --from=builder /build/packages/data/dist packages/data/dist/
COPY --from=builder /build/packages/identity/dist packages/identity/dist/
COPY --from=builder /build/packages/sqlite/dist packages/sqlite/dist/
COPY --from=builder /build/packages/storage/dist packages/storage/dist/
COPY --from=builder /build/packages/sync/dist packages/sync/dist/
COPY --from=builder /build/packages/telemetry/dist packages/telemetry/dist/

# Create data directory (Railway volume mount will override, but useful for local)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV HUB_DATA_DIR=/data

# Default port for local Docker runs (Railway overrides via startCommand)
ENV PORT=4444

EXPOSE 4444

# Run as root to allow writing to Railway-mounted volumes
# (Railway mounts volumes as root-owned)

# Default CMD for local Docker runs; Railway uses startCommand from railway.toml
CMD ["node", "packages/hub/dist/cli.js", "--port", "4444", "--data", "/data"]
