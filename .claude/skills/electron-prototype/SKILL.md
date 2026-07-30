---
name: electron-prototype
description: >-
  Drive the xNet desktop app during development — pick a prototyping rung,
  attach to the running app over CDP, and verify a change without a full
  rebuild. Use when building or testing anything in apps/electron, or when
  tempted to test the desktop app in a browser.
license: MIT
compatibility: Requires pnpm, Electron, and the playwright-electron MCP server
allowed-tools: Bash(pnpm:*) Bash(lsof:*) Read
---

# Prototyping in Electron

The desktop app is the primary target. It is not harder to drive than the web
app — it just needs the right rung.

## Pick a rung by what the change touches

| Rung                         | Loop                         | Cost                   | Use when the change is…                                             |
| ---------------------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------------- |
| **1 — Storybook**            | `pnpm dev:stories` → `:6006` | seconds, HMR           | pure UI: a component, a layout, a state                             |
| **2 — CDP attach**           | `pnpm dev` → `:9223`         | one boot, then seconds | anything touching `window.xnet*`, SQLite, the filesystem, real data |
| **3 — `_electron.launch()`** | a Playwright spec, built app | minutes                | restart durability, deep links, packaging, crash paths              |

**The rule:** if it would render identically in Storybook, use rung 1. If it
touches any `window.xnet*` global, real persistence, or the filesystem, use
rung 2. Only restart durability, deep links, packaging, and crash paths justify
rung 3. **Never reach for rung 3 to check a layout.**

There is a desktop-faithful version of rung 1: **`Open Stories`** in the system
menu spawns Storybook on demand and embeds it in the real app shell — real
window chrome, real platform, real fonts.

## Rung 2 — the loop most work wants

```bash
pnpm --filter xnet-desktop dev
```

The main process opens CDP on `127.0.0.1:9223` in development
(`src/main/index.ts`). Attach with the **`playwright-electron`** MCP server —
registered in `.mcp.json`, already pointed at that endpoint. Then:

```javascript
localStorage.setItem('xnet:test:bypass', 'true')
location.reload()
```

…and advance onboarding if it appears (`Get started with Touch ID` → `Create
your first page`). Now `browser_snapshot`, `browser_click` and
`browser_console_messages` drive the **real** desktop app: real preload, real
IPC, real `better-sqlite3`.

**Confirm which instance you attached to** before trusting anything. A stale
Electron from a crashed run, or a second profile, will happily answer on 9223.
The profile name in the title bar is the cheapest signal.

## Never test Electron in a browser

The preload exposes 10 `contextBridge` namespaces and the renderer calls them
at ~76 sites with almost no guards. Opening `:5177` in a tab gives you a
`TypeError` before first paint — that is correct behaviour for a native app,
not a bug to work around. Do not build a browser shim for it; `apps/web` is
already the browser-native surface.

## Ports

| Port | What                        |
| ---- | --------------------------- |
| 5177 | renderer (Vite)             |
| 9223 | CDP, dev only               |
| 9224 | CDP for the `user2` profile |
| 4444 | hub                         |

Two instances for sync testing:

```bash
pnpm --filter xnet-desktop dev:both
```

`dev:user2` sets `ELECTRON_CDP_PORT=9224`, so the two instances no longer
collide on 9223.

## The native rebuild

`dev:electron` runs `scripts/rebuild-if-stale.mjs`, which rebuilds
`better-sqlite3`, `usearch` and `sharp` only when Electron's version, those
modules' versions, or the lockfile changed (~20s cold, 0s warm). If you hit a
native-module load error at boot, the stamp is the first suspect:

```bash
XNET_FORCE_ELECTRON_REBUILD=1 pnpm --filter xnet-desktop dev
pnpm --filter xnet-desktop run deps:electron   # always rebuilds
```

## HMR caveat

A component hot-reloaded ten times can hold state a fresh boot never would. For
anything about initialisation order, restart the app rather than trusting HMR —
that is part of why rung 3 exists.

## Related

- `apps/electron/AGENTS.md` — loads automatically when you read files there
- `verification-before-completion` — "it works" needs the app, not a compile
