# xNet Applications

Platform-specific applications built on the xNet SDK.

## Applications

| App                    | Platform              | Tech Stack                                           | Description                              |
| ---------------------- | --------------------- | ---------------------------------------------------- | ---------------------------------------- |
| [electron](./electron) | macOS, Windows, Linux | Electron + Vite + React + TanStack Router + Tailwind | Desktop app (primary development target) |
| [web](./web)           | Browser               | Vite + React + TanStack Router + Workbox PWA         | Progressive web app                      |
| [expo](./expo)         | iOS, Android          | Expo SDK 52 + React Native + React Navigation        | Mobile app                               |

## Development

```bash
# Electron (primary -- starts hub + app concurrently)
cd apps/electron
pnpm dev

# Two Electron instances for sync testing
cd apps/electron
pnpm dev:both

# Web
cd apps/web
pnpm dev

# Expo
cd apps/expo
pnpm start
pnpm ios
```

## Package Dependencies

```mermaid
flowchart TD
    subgraph Electron["Electron App"]
        E["xnet-desktop"]
    end

    subgraph Web["Web App"]
        W["xnet-web"]
    end

    subgraph Expo["Expo App"]
        X["xnet-mobile"]
    end

    E --> canvas & core & data & plugins & devtools & identity & storage & sync & editor & react & sdk & telemetry & ui & views
    W --> data & editor & react & sdk & storage & ui
    X --> react & sdk
```

The Electron app uses the full package set. Web uses a subset. Expo uses the minimal React + SDK layer.
