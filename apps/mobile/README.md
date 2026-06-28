# xNet Mobile Shell (Capacitor)

The iOS/Android app is the **`apps/web` SPA hosted in a native webview**. There is
no second UI: documents, databases, canvas and dashboards are the exact same web
build that ships to browsers and Electron. This directory is the thin native
shell — see [`docs/explorations/0238_…NATIVE_WEBVIEW_SHELL.md`](../../docs/explorations).

> **Decision (0238):** Capacitor was chosen over Expo+`react-native-webview` and
> over native Swift+WKWebView. It serves the build from `capacitor://localhost`
> (a real origin), so COOP/COEP headers can be set — which unlocks
> `SharedArrayBuffer` and the full-speed sqlite-wasm OPFS backend **inside** the
> webview — and it emits **both** iOS and Android from one config. Swift is
> iOS-only; Expo needs an embedded static server to match.

## Why a webview (and not native re-implementation)

The data layer runs unchanged inside the webview: sqlite-wasm + OPFS for storage,
the same `@xnetjs/runtime` client, the same sync. The mobile-specific code is just
the **native chrome** in [`apps/web/src/native/chrome.ts`](../web/src/native/chrome.ts)
(deep links, background flush, haptics) plus this config. That the in-webview
client passes the identical data contract is enforced by
`packages/runtime/src/adapter-conformance.mobile.test.ts`.

## Prerequisites

Capacitor's CLI and native tooling are **not** repo dependencies (they need
Xcode / Android Studio and would bloat the install). The scripts call them via
`npx`, so you need:

- Node + pnpm (repo standard)
- **iOS:** macOS + Xcode 15+, CocoaPods
- **Android:** Android Studio + SDK (API 29+), JDK 17

## First-time setup

```bash
# 1. Build the hash-router web bundle the shell will host.
pnpm --filter xnet-mobile-shell build:web      # → apps/web/dist-mobile

# 2. Generate the native projects (writes ./ios and ./android; gitignored).
pnpm --filter xnet-mobile-shell add:ios
pnpm --filter xnet-mobile-shell add:android
```

## Develop / run

```bash
# Rebuild the web bundle and copy it into the native projects.
pnpm --filter xnet-mobile-shell sync

# Open in the native IDE to run on a simulator/device.
pnpm --filter xnet-mobile-shell open:ios
pnpm --filter xnet-mobile-shell open:android
```

## Cross-origin isolation (the OPFS fast path)

`capacitor.config.json` sets `server.responseHeaders` to
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
require-corp`. After a build, **verify on device** that `crossOriginIsolated ===
true` and that SQLite reports the `sync-access-handle` backend
(`detectOpfsCapability()` in `@xnetjs/sqlite`). Targets: **iOS 16.4+**, **Android
10 / Chrome 108+**. Below iOS 16.4 the adapter automatically falls back to the
async OPFS backend (still durable, slower I/O).

## Testing

End-to-end flows that drive the webview DOM live in
[`tests/mobile/`](../../tests/mobile) (Maestro). Fast web-layer coverage at phone
viewports runs under the existing Playwright `mobile-webkit` / `mobile-chromium`
projects (`tests/e2e`).

## What is NOT here yet

This is the buildable scaffold. Native capability plugins called for by 0238 —
secure-storage-backed identity, biometric unlock, push notifications, the native
share target, status-bar/splash polish — are follow-ups; `chrome.ts` already
wires the dependency-free subset (deep links, background flush, haptics).
