# apps/electron — desktop surface

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

Desktop is the **primary** target: integrate new features here first, before Web
or Expo.

## Prototyping ladder (0404)

Pick by what the change touches, not by convenience.

| Rung                     | Loop                                          | Use when the change is…                                |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| 1 — Storybook            | `pnpm dev:stories` → `:6006`                  | pure UI: a component, a layout, a state                |
| 2 — CDP attach           | `pnpm dev` → this tree's CDP port (see below) | anything touching `window.xnet*`, SQLite, native APIs  |
| 3 — `_electron.launch()` | `tests/e2e/src/electron-smoke.spec.ts`        | restart durability, deep links, packaging, crash paths |

Never reach for rung 3 to check a layout.

**Never test Electron in a plain browser.** The renderer depends on its preload
and cannot boot in a tab — see below. Drive it with `playwright-electron` over
CDP.

## Ports are derived, not fixed (0413)

**Do not hard-code a port. Ask the app which one it is on.**

`pnpm dev` resolves the profile and a block of ten ports from the **worktree**,
once, in `scripts/dev-launch.mjs`:

```text
blockBase = 20000 + hash(worktree path) % 500 * 10
  +0 renderer   +1 CDP   +2 hub   +3 local API   +4…+9 reserved
```

The **main checkout keeps the legacy fixed ports** — 5177 / 9223 / 4444 /
31415, profile `default` — so nothing there moved. Every linked worktree gets
its own block, its own `userData` (`xnet-desktop-wt-<slug>`), and therefore its
own single-instance lock. Two worktrees can now run at once.

```bash
pnpm --filter xnet-desktop dev:scope   # print this tree's profile and ports
pnpm dev                               # prints them too, then `[xnet-dev] ready {…}`
pnpm --filter xnet-desktop dev:clean   # prune profiles whose worktree is gone
```

Wait for the machine-readable ready line before attaching — it means the CDP
port was checked and is serving **this** tree's renderer:

```text
[xnet-dev] ready {"profile":"wt-…","renderer":23400,"cdp":23401,…,"branch":"…"}
```

Override any single service with `VITE_PORT`, `ELECTRON_CDP_PORT`,
`XNET_HUB_PORT` or `XNET_LOCAL_API_PORT`; `XNET_PROFILE` overrides the profile.
`dev:both` still runs two instances for sync testing.

> The renderer now uses `strictPort`. A taken port **fails** instead of quietly
> becoming the next one — that silent drift is why the port tables here used to
> lie.

## Confirm which instance you are driving

Never assume. One `browser_evaluate` answers it:

```js
window.__xnetDev // { worktree, branch, commit, profile, ports, pid, startedAt, logs() }
```

Dev-only, and `cdp-dev-only.test.ts` asserts it never ships. The window title
also names the profile and commit in development, for every profile including
`default` — it used to be plain `xNet`, which made it useless in exactly the
case worth catching.

Losing the lock is now a named error and **exit 1**. It used to be `app.quit()`
and exit 0, which an agent read as success before attaching to someone else's
app.

## Logs from all three processes

`window.__xnetDev.logs()` returns a bounded ring buffer of `main` and `data`
records, including everything logged **before the window existed** — boot
failures a CDP-attached agent could not otherwise see. Live records also land
in the renderer console tagged `[main]` / `[data]`, so
`browser_console_messages` covers the whole app rather than one process of
three. Development only; production logging is 0315's.

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
