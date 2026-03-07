# xNet Desktop

Electron desktop app for macOS, Windows, and Linux -- the primary development target for xNet.

## Development

```bash
pnpm dev           # Start hub + app concurrently
pnpm dev:both      # Two instances for sync testing
pnpm run deps:node # Rebuild native deps for plain Node tests
pnpm run deps:electron # Rebuild native deps for Electron runtime
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

## Coding Workspace Shell

The Electron coding workspace shell is the dogfood target for the self-editing MVP.

- Left rail: xNet-backed session summaries, dirty-state badges, and worktree selection
- Center panel: shared OpenCode Web host
- Right panel: preview, diff, files, markdown, screenshots, and PR draft flows

### Local dependencies

- `git` on PATH for worktrees, diffs, and cleanup
- `pnpm` on PATH for preview runtimes
- `gh` on PATH plus `gh auth login` for PR creation
- `opencode` on PATH, or `XNET_OPENCODE_BINARY=/absolute/path/to/opencode`

### Recovery flows

- OpenCode missing: install from [OpenCode docs](https://opencode.ai/docs/install), then refresh the center panel
- Preview startup failure: run `pnpm install`, then `pnpm run deps:electron`, then restart the preview from the right panel
- If `pnpm run deps:electron` fails inside `@electron/rebuild` with `util.styleText is not a function`, rebuild the native module directly with `npm rebuild better-sqlite3 --runtime=electron --target=33.4.11 --arch=arm64 --dist-url=https://electronjs.org/headers`
- PR creation failure: ensure GitHub CLI is installed and authenticated with `gh auth login`
- Worktree removal blocked: review the diff, commit, or revert local changes before removing the session
