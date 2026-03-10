#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${CANVAS_V2_WEB_PORT:-4174}"
WEB_HOST="127.0.0.1"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}"
WEB_SERVER_LOG="${ROOT_DIR}/tmp/canvas-v2-web-server.log"
WEB_PID=""

cleanup() {
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill "${WEB_PID}" 2>/dev/null || true
    wait "${WEB_PID}" 2>/dev/null || true
  fi

  lsof -ti:"${WEB_PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"

  for _attempt in $(seq 1 "${attempts}"); do
    if curl -sf "${url}" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for ${url}" >&2
  return 1
}

trap cleanup EXIT

cd "${ROOT_DIR}"

echo "==> Canvas V2 focused renderer tests"
pnpm --filter @xnetjs/canvas exec vitest run \
  src/__tests__/canvas-navigation-shell.test.tsx \
  src/__tests__/minimap.test.ts \
  src/__tests__/performance.test.ts

echo "==> Canvas V2 workbench build"
pnpm build:stories

echo "==> Electron production build"
pnpm --filter xnet-desktop build

echo "==> Web production build"
pnpm --filter xnet-web build

echo "==> Electron canvas end-to-end gate"
pnpm --filter @xnetjs/e2e-tests exec playwright test src/electron-canvas.spec.ts --project=chromium

echo "==> Starting web gate server on ${WEB_URL}"
pnpm --filter xnet-web exec vite --host "${WEB_HOST}" --port "${WEB_PORT}" \
  >"${WEB_SERVER_LOG}" 2>&1 &
WEB_PID=$!

wait_for_http "${WEB_URL}"

echo "==> Web canvas end-to-end gate"
PLAYWRIGHT_TEST_BASE_URL="${WEB_URL}" \
  pnpm --filter @xnetjs/e2e-tests exec playwright test src/web-canvas-ingestion.spec.ts --project=chromium

echo
echo "Canvas V2 release gate passed."
echo "  Web preview URL: ${WEB_URL}"
echo "  Storybook build: ok"
echo "  Electron build: ok"
echo "  Web build: ok"
echo "  Electron e2e: ok"
echo "  Web e2e: ok"
