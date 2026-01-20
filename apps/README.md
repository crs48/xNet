# xNet Applications

Platform-specific applications built on the xNet SDK.

## Applications

| App | Platform | Description |
|-----|----------|-------------|
| [electron](./electron) | macOS | Desktop app with SQLite storage |
| [expo](./expo) | iOS | Mobile app with SQLite storage |
| [web](./web) | Browser | PWA with IndexedDB storage |

## Development

```bash
# Electron (macOS)
cd apps/electron
pnpm dev

# Expo (iOS)
cd apps/expo
pnpm start
pnpm ios

# Web
cd apps/web
pnpm dev
```
