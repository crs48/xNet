# xNet Desktop

Electron desktop app for macOS, Windows, and Linux -- the primary development target for xNet.

## Development

```bash
pnpm dev           # Start hub + app concurrently
pnpm dev:both      # Two instances for sync testing
```

## Build

```bash
pnpm build         # Build for production
pnpm dist          # Create distributable
```

## Features

- Local-first document storage
- Rich text editor with slash commands, wikilinks, drag-drop
- Database views (table, board, gallery, timeline, calendar)
- Infinite canvas
- Plugin system with sandboxed scripts
- DevTools (9-panel debug suite)
- Hub sync (WebSocket to @xnetjs/hub)
- History, undo/redo, audit trails
- Comments on documents and databases
- File uploads and blob sync
- Telemetry with tiered consent
- Native OS titlebar
- Keyboard shortcuts

## Tech Stack

- **Electron** + **electron-vite** -- Desktop runtime
- **React 18** -- UI framework
- **TanStack Router** -- Type-safe routing
- **Tailwind CSS** -- Styling
- All `@xnetjs/*` packages (canvas, core, data, devtools, editor, history, identity, plugins, react, sdk, storage, sync, telemetry, ui, views)

## Debugging

Dev server runs at `http://localhost:5177`. Connect with Playwright MCP for automated testing:

```bash
# Enable sync debug logs in the browser console
localStorage.setItem('xnet:sync:debug', 'true')
```
