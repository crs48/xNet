# xNet Mobile (Expo)

A small **developer demo** of the xNet building blocks on a phone: on-device
SQLite storage, a signed local-first identity, and native-fast reads through the
React hooks — the same `@xnetjs/*` packages the web app uses, running on real
hardware.

It's built to **run inside [Expo Go](https://expo.dev/go)** — no App Store, no
sideloading. It uses only modules bundled into Expo Go (`expo-sqlite`,
`expo-secure-store`, `react-native-webview`), so there's no custom native build.

> Full mobile app vs. this demo: the shipping mobile app is the `apps/web` SPA in
> a native webview (`apps/mobile`, Capacitor — see
> [`docs/explorations/0238_…`](../../docs/explorations)). **This** Expo app is the
> quick "see it on your phone in a minute" demo, surfaced on the site at
> [`/mobile`](../../site/src/pages/mobile.astro).

## Run it (Expo Go)

```bash
pnpm install                      # from the repo root
pnpm --filter xnet-mobile start   # prints a QR code
```

1. Install **Expo Go** (App Store / Google Play).
2. Scan the QR that `start` prints — camera on iOS, or from inside Expo Go on
   Android.
3. xNet opens in Expo Go.

```bash
pnpm --filter xnet-mobile ios     # or run on a simulator
```

## Entry point

The app registers its root component in [`index.js`](./index.js) via
`registerRootComponent(App)` (it uses `App.tsx` + React Navigation, **not**
expo-router). `package.json` → `"main": "index.js"`.

## Hosting a one-scan QR on the site

The `/mobile` page renders a QR from `PUBLIC_EXPO_GO_DEMO_URL`. To make it a true
one-scan launch, publish a build and point that env var at it:

- **EAS Update** (recommended): `eas update --branch demo`, then use the
  `exp://u.expo.dev/<projectId>?channel-name=demo` deep link.
- **Expo Snack**: an `https://snack.expo.dev/@<user>/xnet-demo` URL.

Until it's set, the site QR falls back to this folder's source (these steps).

## Features

- Local-first document storage (on-device SQLite, works offline)
- Signed identity held in the secure enclave (`expo-secure-store`)
- Native navigation (React Navigation)
- Deep links: `xnet://doc/<id>`, `xnet://db/<id>`

## Tech Stack

- **Expo SDK 52** · **React Native 0.76** · **React Navigation**
- `@xnetjs/core`, `@xnetjs/data`, `@xnetjs/react`, `@xnetjs/sqlite`
