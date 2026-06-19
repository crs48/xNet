# xNet Cloud control plane — container image (exploration 0201).
#
# Build from the REPO ROOT — the build needs the pnpm workspace and every
# @xnetjs/* package in the control plane's closure:
#
#   docker build -f apps/cloud/Dockerfile -t xnet-cloud .
#
# The repo-root .dockerignore is tuned for the hub build (it excludes apps/), so a
# Dockerfile-scoped ignore (apps/cloud/Dockerfile.dockerignore) keeps apps/cloud +
# packages/ in the context. Cloud Run injects $PORT; index.ts reads env.PORT ?? 4455.
#
# The control plane's closure has no native modules (Firestore/R2/Stripe SDKs are
# pure JS), so there are no node-gyp build tools or rebuild steps here — unlike the
# hub image, which carries better-sqlite3 + Litestream.

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Workspace manifests + lockfile first (kept on their own layer for install caching).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ patches/
COPY packages/ packages/
COPY apps/cloud/ apps/cloud/

# Install the closure (with dev deps so tsup can build), build, then prune dev deps
# in place — `pnpm install --prod` leaves the built dist untouched and keeps the
# workspace links (@xnetjs/* are runtime deps). The "..." filter installs/builds
# every package in xnet-cloud's dependency closure, not just xnet-cloud itself.
#
# `--config.confirm-modules-purge=false`: switching the modules dir from the dev
# install to prod-only makes pnpm want to purge node_modules; in a non-TTY build
# (Cloud Build / buildx) it otherwise aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
RUN pnpm install --frozen-lockfile --filter xnet-cloud... \
  && pnpm --filter xnet-cloud... build \
  && pnpm install --prod --frozen-lockfile --ignore-scripts --config.confirm-modules-purge=false --filter xnet-cloud... \
  && rm -rf /root/.cache/node/corepack

EXPOSE 4455
CMD ["node", "apps/cloud/dist/index.js"]
