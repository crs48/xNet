# apps/electron — desktop surface

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

Desktop is the **primary** target: integrate new features here first, before Web
or Expo.

## Prototyping ladder (0404)

Pick by what the change touches, not by convenience.

| Rung | Loop | Use when the change is… |
| --- | --- | --- |
| 1 — Storybook | `pnpm dev:stories` → `:6006` | pure UI: a component, a layout, a state |
| 2 — CDP attach | `pnpm dev` → `:9223` → `playwright-electron` | anything touching `window.xnet*`, SQLite, native APIs |
| 3 — `_electron.launch()` | `tests/e2e/src/electron-smoke.spec.ts` | restart durability, deep links, packaging, crash paths |

Never reach for rung 3 to check a layout.

**Never test Electron in a plain browser.** The renderer depends on its preload
and cannot boot in a tab — see below. Drive it with `playwright-electron` over
CDP.

## Ports

| Port | What |
| --- | --- |
| 5177 | renderer (Vite) — `electron.vite.config.ts` |
| 9223 | CDP, dev only — `src/main/index.ts` |
| 9224 | CDP for the `user2` profile |
| 4444 | hub |

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

`dev:electron` force-rebuilds `better-sqlite3`, `usearch` and `sharp` on every
start (`@electron/rebuild -f`). Expect that cost on a cold loop.
