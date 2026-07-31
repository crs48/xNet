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

**Ports are derived from the worktree (0413), not fixed.** Wait for the
machine-readable ready line, which tells you where to attach:

```text
[xnet-dev] ready {"profile":"wt-…","renderer":23400,"cdp":23401,…,"branch":"…"}
```

The main checkout keeps the legacy `9223`; every linked worktree gets its own
block. `pnpm --filter xnet-desktop dev:scope` prints this tree's ports without
starting anything. Attach with the **`playwright-electron`** MCP server —
registered in `.mcp.json`, pointed at `9223` — and pass `--cdp-endpoint` for a
worktree's port. Then:

```javascript
localStorage.setItem('xnet:test:bypass', 'true')
location.reload()
```

…and advance onboarding if it appears (`Get started with Touch ID` → `Create
your first page`). Now `browser_snapshot`, `browser_click` and
`browser_console_messages` drive the **real** desktop app: real preload, real
IPC, real `better-sqlite3`.

## Confirm which instance you attached to

Do this before trusting anything, and do it by asking — not by looking:

```js
window.__xnetDev // { worktree, branch, commit, profile, ports, pid, startedAt, logs() }
```

This used to be "check the profile name in the title bar," which could not
work: the title was plain `xNet` for the `default` profile, so a stale instance
and your own were indistinguishable — the exact case worth catching. The title
now names the profile and commit in development, and `__xnetDev` is the
authoritative answer.

`pnpm dev` also refuses to report ready if its CDP port is serving another
tree's renderer, and losing the single-instance lock is now a named error with
**exit 1** rather than a silent exit 0.

## Logs from all three processes

CDP shows you the renderer. `main` and `data-process` records now reach the
renderer console too, tagged `[main]` / `[data]`, so
`browser_console_messages` covers the whole app. For failures from **before**
the window existed — the ones that matter most — read the ring buffer:

```js
await window.__xnetDev.logs()
```

## Never test Electron in a browser

The preload exposes 10 `contextBridge` namespaces and the renderer calls them
at ~76 sites with almost no guards. Opening `:5177` in a tab gives you a
`TypeError` before first paint — that is correct behaviour for a native app,
not a bug to work around. Do not build a browser shim for it; `apps/web` is
already the browser-native surface.

## Ports

Derived per worktree — `blockBase = 20000 + hash(worktree) % 500 * 10`, then
`+0` renderer, `+1` CDP, `+2` hub, `+3` local API. The main checkout keeps
5177 / 9223 / 4444 / 31415 and the `default` profile.

```bash
pnpm --filter xnet-desktop dev:scope   # this tree's profile and ports
pnpm --filter xnet-desktop dev:clean   # prune profiles whose worktree is gone
pnpm --filter xnet-desktop dev:both    # two instances for sync testing
```

Because each worktree also gets its own `userData`, it gets its own Chromium
single-instance lock — which is what lets two trees run at once. Override one
service with `VITE_PORT` / `ELECTRON_CDP_PORT` / `XNET_HUB_PORT` /
`XNET_LOCAL_API_PORT`, or the profile with `XNET_PROFILE`.

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
