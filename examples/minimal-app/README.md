# xNet minimal app — a synced multiplayer todo in one file

The smallest complete xNet app: instant identity, one schema, one provider,
one live query. Two browser tabs sync through a local hub in under five
minutes. No accounts, no backend code, no config files.

This directory is intentionally **outside** the monorepo workspace — copy it
anywhere and it works against the published npm packages. See it live at
[xnet.fyi/demos](https://xnet.fyi/demos/) (the "Collab todo" demo is this app
with cursors added).

## Quickstart

```bash
# copy this directory anywhere, then:
npm install
npm run dev
```

That's it — the app syncs through the public demo hub (`wss://hub.xnet.fyi`)
out of the box. Open the printed URL **in two browser windows**. Each window
mints its own throwaway identity (`generateIdentity()` — a DID + Ed25519
keypair, no signup). Add a todo in one window; it appears in the other.
Writes land in the local store synchronously and sync in the background —
go offline and the app keeps working; changes catch up on reconnect.

To run your own hub instead (recommended for anything beyond kicking the
tires — the demo hub is a quota'd sandbox with periodic eviction):

```bash
npm run hub    # docker run ghcr.io/crs48/xnet-hub with auth off (dev only)
```

then switch `hubUrl` in `src/main.tsx` to `ws://localhost:4444`.

## How joining works

The whole join flow is **one shared string**: everyone who boots with the
same `hubOptions.nodeSyncRoom` against the same hub sees the same data. This
app derives it from the URL (`?room=standup` → room `standup`), so a URL is
an invitation. That's the entire mechanism — no tokens, no invites, no user
management. For real apps that need access control, see UCAN share links
(`createShareToken` in `@xnetjs/identity`) and schema `authorization` blocks.

## The one file, annotated

Everything is in [`src/main.tsx`](src/main.tsx) (Node 18+ to build):

1. **Schemas** — `defineSchema` with property builders (`text`, `checkbox`)
   and a one-line authorization preset (`presets.open()` = wiki-style).
   The `Board` schema adds `document: 'yjs'` — a live collaborative doc
   whose Awareness channel carries the cursors.
2. **Identity** — `generateIdentity()` returns `{ identity, privateKey }`.
   Persist the key if you want a stable identity; here each tab is a fresh
   anonymous author, which is exactly what a demo wants.
3. **Provider** — `XNetProvider` boots the store (in-memory by default),
   signs every change with your key, and relays through `hubUrl`.
4. **Data hooks** — `useQuery(Todo)` is a live subscription; `useMutate()`
   gives optimistic `create`/`update`/`remove`. There is no cache
   invalidation to manage — the store IS the cache.
5. **Presence hooks** — `useNode(Board, …)` exposes the doc's `awareness`;
   `usePresence(awareness, { x, y })` broadcasts throttled, ephemeral peer
   state. Cursors never touch storage and vanish when a peer disconnects.

Point `hubUrl` at `wss://hub.xnet.fyi` to sync through the public demo hub
instead of a local one (sandbox: quota'd, idle rooms are evicted — don't
store anything you want to keep).

## Where to go next

- Add live cursors: `useNode(...).awareness` + `usePresence` from
  `@xnetjs/react` (see the hosted demos' source in `apps/demos/` in the
  [xNet repo](https://github.com/xnet-project/xNet)).
- Add a collaborative document: `document: 'yjs'` on the schema, then
  `useNode(...).doc` is a shared Y.Doc.
- Self-host the hub: `npx xnet-hub start` (see `packages/hub/README.md` for
  Docker/Railway/Fly recipes; drop `--no-auth` and wire real auth for
  anything public).
