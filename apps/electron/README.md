# xNet Desktop

Electron desktop app for macOS, Windows, and Linux -- the primary development target for xNet.

## Development

```bash
pnpm dev           # Start hub + app concurrently
pnpm dev:both      # Two instances for sync testing
```

From the repo root you can also run the shared Storybook runtime directly:

```bash
pnpm dev:stories
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
- DevTools (15-panel debug suite)
- Hub sync (WebSocket to @xnetjs/hub)
- History, undo/redo, audit trails
- Comments on documents and databases
- File uploads and blob sync
- Telemetry with tiered consent
- Native OS titlebar
- Keyboard shortcuts
- Dev-only embedded Storybook surface for isolated UI development

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

## Stories Workbench

In development, Electron can open the root Storybook catalog inside the app shell.

- Open `Open Stories` from the system menu or the command palette.
- The renderer asks the main process to start Storybook on demand if it is not already running.
- The embedded surface shows startup, retry, and error states instead of assuming the server is already available.
- The catalog includes shared UI, Electron renderer stories, and workbenches for the editor, database views, and canvas.
