# Mobile end-to-end flows (Maestro)

Black-box E2E for the native shell (`apps/mobile`). Maestro drives the **webview
DOM** and the native chrome with one declarative flow — no Appium-style context
switching — which is why it fits a webview-hosted app (exploration 0238).

These flows assert the things only a real device build can: that the four
surfaces render inside the webview, that content created **offline** survives an
app relaunch (OPFS durability), and that going back online **syncs**.

## Layers (don't duplicate coverage)

- **Maestro (here)** — native build + webview DOM + offline/sync/relaunch. Runs
  against a `.ipa`/`.apk` on a simulator/emulator (or Maestro Cloud).
- **Playwright `mobile-webkit` / `mobile-chromium`** (`tests/e2e`) — fast
  web-layer coverage at phone viewports on every PR. Owns the bottom of the
  pyramid; see `tests/e2e/src/mobile-surfaces.spec.ts`.

## Run locally

```bash
# Build + install the app first (see apps/mobile/README.md), then:
maestro test tests/mobile/flows/smoke.yaml
maestro test tests/mobile/flows/                 # whole suite
```

## CI

`.github/workflows/mobile-e2e.yml` builds the web bundle and runs this suite on a
simulator/emulator. It is `workflow_dispatch` (manual) for now — wiring it to a
hosted iOS/Android runner or Maestro Cloud is the remaining infra step (0238).

## Selectors

Flows target text/`testID`/accessibility labels that resolve to the hosted
`apps/web` DOM. When the web UI labels change, update the flows here — they are
the contract for the native surface.
