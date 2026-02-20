#!/usr/bin/env bash

set -euo pipefail

ARCH="${1:-arm64}"

case "$ARCH" in
  arm64|x64)
    ;;
  *)
    echo "Unsupported arch: $ARCH"
    echo "Usage: ./scripts/build-macos-self-signed.sh [arm64|x64]"
    exit 1
    ;;
esac

if [ "$ARCH" = "arm64" ]; then
  APP_PATH="dist/mac-arm64/xNet.app"
else
  APP_PATH="dist/mac/xNet.app"
fi

echo "Building unpacked macOS $ARCH app..."
pnpm electron-builder --mac --"$ARCH" --dir --publish never

echo "Applying ad-hoc signature to $APP_PATH..."
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "Packaging signed app into DMG/ZIP..."
pnpm electron-builder --prepackaged "$APP_PATH" --mac dmg zip --"$ARCH" --publish never

echo "Done. Artifacts are in apps/electron/dist/."
