# xNet Web

Progressive Web App for xNet -- a lighter version of the Electron app that runs in any browser.

## Development

```bash
pnpm dev           # Start dev server
```

## Build

```bash
pnpm build         # Build for production
pnpm preview       # Preview production build
```

## Features

- Offline-first with Service Worker (Workbox)
- IndexedDB for local storage
- Rich text editor
- Pages-focused (subset of Electron features)
- Dark mode support
- Installable as PWA

## Tech Stack

- **Vite** -- Build tool
- **React 18** -- UI framework
- **TanStack Router** -- Type-safe routing
- **Tailwind CSS** -- Styling
- **Workbox** -- Service worker / PWA
- `@xnet/data`, `@xnet/editor`, `@xnet/react`, `@xnet/sdk`, `@xnet/storage`, `@xnet/ui`
