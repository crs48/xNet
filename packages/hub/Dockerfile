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
COPY packages/storage/package.json packages/storage/
COPY packages/sync/package.json packages/sync/

# Copy patches for pnpm
COPY patches/ patches/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile --filter @xnet/hub...

# Copy source
COPY packages/hub/ packages/hub/
COPY packages/core/ packages/core/
COPY packages/crypto/ packages/crypto/
COPY packages/data/ packages/data/
COPY packages/identity/ packages/identity/
COPY packages/storage/ packages/storage/
COPY packages/sync/ packages/sync/
COPY tsconfig.json ./

# Build hub + dependencies
RUN pnpm --filter @xnet/hub... build

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
COPY --from=builder /build/packages/storage/package.json packages/storage/
COPY --from=builder /build/packages/sync/package.json packages/sync/

# Copy patches for pnpm
COPY --from=builder /build/patches/ patches/

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && corepack enable \
  && pnpm install --frozen-lockfile --prod --ignore-scripts --filter @xnet/hub... \
  && pnpm rebuild better-sqlite3 --filter @xnet/hub... \
  && apk del .build-deps

# Copy built artifacts
COPY --from=builder /build/packages/hub/dist packages/hub/dist/
COPY --from=builder /build/packages/core/dist packages/core/dist/
COPY --from=builder /build/packages/crypto/dist packages/crypto/dist/
COPY --from=builder /build/packages/data/dist packages/data/dist/
COPY --from=builder /build/packages/identity/dist packages/identity/dist/
COPY --from=builder /build/packages/storage/dist packages/storage/dist/
COPY --from=builder /build/packages/sync/dist packages/sync/dist/

# Create data directory
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV HUB_DATA_DIR=/data

# Railway sets PORT env var; default to 4444 for local dev
ENV PORT=4444

EXPOSE 4444

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

USER node

# Use shell form to expand $PORT (Railway sets this env var)
CMD sh -c "node packages/hub/dist/cli.js --port $PORT --data /data"
