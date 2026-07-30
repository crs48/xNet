# apps/electron — desktop surface

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

Desktop is the **primary** target: integrate new features here first, before Web
or Expo.

## Prototyping ladder (0404)

Pick by what the change touches, not by convenience.

| Rung                     | Loop                                         | Use when the change is…                                |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| 1 — Storybook            | `pnpm dev:stories` → `:6006`                 | pure UI: a component, a layout, a state                |
| 2 — CDP attach           | `pnpm dev` → `:9223` → `playwright-electron` | anything touching `window.xnet*`, SQLite, native APIs  |
| 3 — `_electron.launch()` | `tests/e2e/src/electron-smoke.spec.ts`       | restart durability, deep links, packaging, crash paths |

Never reach for rung 3 to check a layout.

**Never test Electron in a plain browser.** The renderer depends on its preload
and cannot boot in a tab — see below. Drive it with `playwright-electron` over
CDP.

## Ports

| Port | What                                                               |
| ---- | ------------------------------------------------------------------ |
| 5177 | renderer (Vite) — `electron.vite.config.ts`                        |
| 9223 | CDP, dev only — `src/main/index.ts` sets `--remote-debugging-port` |
| 9224 | CDP for the `user2` profile                                        |
| 4444 | hub                                                                |

```bash
pnpm dev        # hub + app
pnpm dev:both   # two instances for sync testing
```

`dev:both` does not set `ELECTRON_CDP_PORT`, so both instances request 9223.
For a two-instance session, set the ports explicitly:

```bash
ELECTRON_CDP_PORT=9223 pnpm --filter xnet-desktop run dev:electron
XNET_PROFILE=user2 VITE_PORT=5174 ELECTRON_CDP_PORT=9224 pnpm --filter xnet-desktop run dev:user2
```

## Preload

The preload exposes **10** `contextBridge.exposeInMainWorld` namespaces
(`xnet`, `xnetBSM`, `xnetNodes`, `xnetServices`, `xnetMeetings`,
`xnetAgentBridge`, `xnetLocalAPI`, `xnetTunnel`, `xnetSocialImport`,
`xnetStorybook`). The renderer calls them at ~76 sites and guards almost none —
correct for a native app, and the reason "just open the renderer in a tab" is
structurally unavailable.

## Embedded Storybook

`Open Stories` in the system menu spawns Storybook on demand
(`src/main/storybook-ipc.ts`) and embeds it in the app shell — the desktop-
faithful version of rung 1, with real window chrome.

## Native rebuild

`scripts/rebuild-if-stale.mjs` rebuilds `better-sqlite3`, `usearch` and `sharp`
for Electron's ABI, but only when Electron, those modules or the lockfile moved
(0404). Expect the cost on a cold loop, not on every start. Force it with
`XNET_FORCE_ELECTRON_REBUILD=1`, or `pnpm run deps:electron`.

`dev` and `dev:both` run the rebuild **before** `concurrently`, so nothing boots
against a binary that is still being written. `deps:node` rebuilds the same
binary for system Node — `pnpm test` does this — and so drops the stamp on its
way out, which sends the next `dev` back through the Electron rebuild.

**One native module, one ABI.** pnpm links a single physical `better-sqlite3`
into both `apps/electron` and `packages/hub`, so the Electron rebuild is also
the hub's copy — the hub cannot load it under system Node
(`NODE_MODULE_VERSION 130` vs `131`). The dev hub therefore runs on Electron's
Node via `ELECTRON_RUN_AS_NODE=1` (`scripts/run-dev-hub.mjs`), which is Node
20.18 on Electron 33. Do not "fix" a hub ABI error inside `pnpm dev` by
rebuilding for Node — that just moves the breakage to the app.

`pnpm --filter @xnetjs/hub dev` still runs on system Node. That is the right
command when Electron is out of the picture, but it needs the binary built to
match: run `pnpm --filter xnet-desktop run deps:node` first.
