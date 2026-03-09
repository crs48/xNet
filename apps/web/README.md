# xNet Web

Progressive Web App for xNet -- a lighter version of the Electron app that runs in any browser.

## Development

```bash
pnpm dev           # Start dev server
```

From the repo root you can also run the shared Storybook runtime directly:

```bash
pnpm dev:stories
```

## Build

```bash
pnpm build         # Build for production
pnpm preview       # Preview production build
```

## Features

- Offline-first with Service Worker (Workbox)
- SQLite (OPFS) for local storage
- Rich text editor
- Pages-focused (subset of Electron features)
- Dark mode support
- Installable as PWA
- Dev-only embedded Storybook route at `/stories`

## Tech Stack

- **Vite** -- Build tool
- **React 18** -- UI framework
- **TanStack Router** -- Type-safe routing
- **Tailwind CSS** -- Styling
- **Workbox** -- Service worker / PWA
- `@xnetjs/data`, `@xnetjs/editor`, `@xnetjs/react`, `@xnetjs/sdk`, `@xnetjs/storage`, `@xnetjs/ui`

## Stories Route

The web app exposes the root Storybook UI at `/stories` during development.

- The route embeds the manager UI in an `iframe`.
- It reads `VITE_STORYBOOK_URL` when provided, otherwise defaults to `http://127.0.0.1:6006`.
- If Storybook is not running, the route renders an instructional empty state instead of failing.
