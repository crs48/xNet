# Workbench "Floating Islands" Redesign

> Status: exploration `[_]` — implementing.
> Sibling context: [[0284_COHERENT_SINGLE_SHELL_REDESIGN]],
> [[0280_MALLEABLE_WORKBENCH]], [[0282_WORKSPACE_EDITING_AFFORDANCES]],
> [[0273_QUIET_SURFACE_WORKSPACE_SHELL]], [[0232_COZY_CALM_AGENT_FIRST]].
> Driven by an external design handoff ("xNet Workbench Redesign — Floating
> Islands", high-fidelity, light + dark).

## Problem Statement

The single shell from 0284 works but reads as a VS-Code-style, edge-to-edge
pane grid: chrome and content share hard borders, everything is one flat
plane, and the surface never feels "center-stage." The design handoff moves
to a calmer, Notion / Claude-desktop feel: **one continuous warm "canvas"
surface (the document) with all chrome floating on top of it as rounded,
softly-shadowed "islands."** The editor is deliberately _not_ an island — it
shares the canvas colour so the document is the brightest, most-forward plane
and the chrome recedes.

This is a **visual + structural reskin of the desktop pinned-chrome frame**,
reusing the existing store, views, hooks and `@xnetjs/ui` primitives. The
LayoutTree / dock / slot-drag / arrange machinery stays; what changes is how
the pinned frame _paints_ itself and how the left sidebar is composed.

## The picture frame

Root is a full-height flex **column** on a single `--canvas` surface with
**11px outer padding** and **8px gaps** between islands.

```
padding:11px  gap:8px
┌───────────────────────────────────────────────────────────────┐
│ ┌ SIDEBAR ┐  ┌──────── EDITOR (base surface, NOT an island) ─┐ ┌ RIGHT ┐ │
│ │ top isl │  │ header (breadcrumb + actions)                 │ │island │ │
│ │  (nav)  │  │ pill-tab strip                                │ │(ctx)  │ │
│ ├─────────┤  │ document / surface content                    │ │       │ │
│ │ bottom  │  │        ┌ ASSISTANT ┐ ┌ VIDEO ┐                 │ │       │ │
│ │ island  │  │        │ float chat│ │ call  │                 │ │       │ │
│ │ (ctxual)│  │        └───────────┘ └───────┘                 │ │       │ │
│ └─────────┘  └───────────────────────────────────────────────┘ └───────┘ │
│ ┌─────────────────────── STATUS BAR island ─────────────────────────┐ │
└───────────────────────────────────────────────────────────────────────┘
```

- Root: `height:100dvh; box-sizing:border-box; padding:11px; flex-col;
gap:8px; background:var(--canvas)`.
- Body row: `flex:1; flex; gap:8px; min-h:0`.
- **Islands** (sidebar top + bottom, right, status, floating chat/call) are the
  only elements with border + radius + shadow:
  `border:1px solid var(--hairline); border-radius:16px;
box-shadow:var(--isl-shadow); overflow:hidden`. Status bar + floating chat
  islands use radius **14px**; popovers **12px**.
- Island fill = `--island-b` (a step **darker** than canvas in light; a step
  **lighter** in dark) so chrome always recedes.
- The editor is `background:var(--island)` (== `--canvas`) with **no** border /
  radius / shadow.

## Design tokens — the warm-clay "floating" override

Add a scoped override on a root class `wb-root` / `wb-root.dark` (the design's
mechanism). It rides on top of the existing 0166 ramp (ink-1/2/3, hairline,
status hues, chart-\*, identity avatars stay). New/overridden tokens:

**Light (`.wb-root`)**

```
--canvas / --island : 44 40% 98%     main surface + editor (brightest, forward)
--island-b          : 40 22% 93%     chrome island fill (a step darker)
--surface-0         : 44 38% 97.5%   popovers, inputs, DS component surfaces
--surface-1         : 42 26% 95%
--surface-2         : 40 20% 92.5%
--hairline/--border : 38 16% 83%
--accent            : 40 20% 89.5%   hover/selection wash, active pill/row
--background-muted  : 40 20% 89%
--isl-shadow : 0 1px 2px hsl(34 22% 30% /.06),0 4px 12px hsl(34 24% 24% /.09),0 10px 24px hsl(34 24% 20% /.07)
--pop-shadow : 0 8px 20px hsl(34 20% 26% /.14),0 22px 50px hsl(34 22% 18% /.20)
```

**Dark (`.wb-root.dark`)** — inverted so content stays brightest

```
--canvas / --island : 30 8% 11.5%    main surface (lighter, forward)
--island-b          : 30 8% 7%       chrome island fill (darker, recedes)
--surface-0         : 30 8% 13%
--surface-1         : 32 8% 10%
--surface-2         : 32 8% 8%
--hairline/--border : 30 7% 19%
--accent            : 32 9% 16%
--background-muted  : 32 9% 15%
--isl-shadow : 0 1px 2px hsl(0 0% 0% /.45),0 5px 14px hsl(0 0% 0% /.4),0 12px 28px hsl(0 0% 0% /.35)
--pop-shadow : 0 10px 26px hsl(0 0% 0% /.6),0 24px 56px hsl(0 0% 0% /.7)
```

Because the existing Tailwind tokens (`bg-surface-0`, `bg-island-b`,
`shadow-isl` …) resolve `hsl(var(--token))`, we introduce `--canvas`,
`--island`, `--island-b`, `--isl-shadow`, `--pop-shadow` as **new** tokens
(with Tailwind utilities) and _override_ `--surface-0/1/2`, `--hairline`,
`--accent`, `--background-muted` under `.wb-root`. The floating look is the
new default for the desktop shell, so `wb-root` is applied by the frame
wrapper; `dark` continues to come from `ThemeProvider` on `<html>`.

## Region-by-region spec

### Sidebar — TWO stacked islands (replaces the single `<nav>`/left dock)

**Top island (fixed height):**

- Row 1: **user avatar** (32px circle → Profile menu) + inline **workspace
  selector** (`flex:1`): monogram square `xN` (24px, radius 7, ink fill) +
  workspace name (13.5px/600) + up/down chevron → workspace menu. No cog.
- **Search** button (full-width, `surface-0` fill, hairline, radius 9): search
  icon + "Search" (ink-3) + `⌘K` Kbd → command palette (`search.open`).
- **New** button (full-width, `--primary` ink fill, white text, radius 9):
  plus + "New" + chevron → New menu.
- **Primary surface rows** (data-driven from `navPinned`; default `Explorer,
Inbox, Tasks`): icon (16) + label (13) + trailing count. Inbox count = ink
  pill; others = muted mono. Active row = `--accent` wash + ink-1 + 500.
- **More** row: 2×2 grid icon + "More" + hidden-count + chevron → surfaces
  roll-out flyout.

**Bottom island (`flex:1`) — CONTEXTUAL, driven by `activeSurface`:**
Header (surface icon + name + live count + `+`) and body swap by surface:

- `explorer` → **Pinned** favorites list + **Workspace** folder tree (reuse
  ExplorerFolderTree / explorer-rows; row context menu via 0285 RowContextMenu).
- `inbox` → notification rows (mention / resolved comment / share request).
- `tasks` → checklist (`Checkbox`); header shows `done/total` (reuse TasksPanel data).
- `chats` → channels + DMs (reuse comms data).
- `data`/`canvases`/`meetings`/`discover`/`marketplace`/`analytics`/`people`
  → generic list rows (icon + name + optional sub + meta).

### Surfaces roll-out (flyout)

Opens to the right of the More row. Popover (radius 12, `--pop-shadow`),
header "SURFACES / Pin to keep visible". One row per surface (icon + name +
count + **pin toggle**). Row click navigates the bottom island (`activeSurface`);
pin toggle promotes/demotes in `navPinned`.

### Editor (base surface — NOT an island)

- **Header (50px):** sidebar-toggle, breadcrumb (`folder / Title`, ellipsizes),
  spacer, **facepile** (overlapped 24px avatars + `+N` chip), **Share** (primary
  Button), divider, **Comments toggle** (active = accent wash → toggles right
  island), **Notifications bell** (destructive dot → notif menu), **⋯ more**.
- **Pill-tab strip (42px):** rounded pill tabs (active = `--accent`; inactive =
  ink-3) with type icon + label + close ×; `+` new-tab; right side split-view +
  history icon buttons. Reuse tab store (`groups`/`openTab`/`closeTab`), restyle
  TabBar to pills.
- **Document:** the router outlet (existing EditorArea content). Centered
  document column styling stays owned by the page views.

### Right island — contextual panel (300px)

Underline `Tabs`: **Comments** / **Properties** / **Activity** + close ×.
Reuse/adapt ContextPanel. Comments = threaded avatars + Input composer;
Properties = key/value rows (Schema→Badge, Owner, Created, Edited, ID→mono);
Activity = status-dot timeline.

### Status bar (island, 32px)

Left: `StatusDot(online)` "synced" + branch (git icon + "main", mono) + "N
peers". Right: "N words", `⌘K` palette shortcut, "saved", **theme toggle**
(sun/moon). Reuse StatusBar + SyncStatus data.

### Floating chat dock (bottom-center of the editor)

Two floating islands docked to the editor region with an exact 8px gap to
every neighbour. Container `position:absolute; left = 11 + sidebarW + 8;
right = 11 + 300 + 8 = 319; bottom = 11 + 32 + 8 = 51` (fall back to 11 per
side when that panel is hidden / focus mode). Direct flex children, gap:8px;
**Assistant** `flex:1`, **Video** fixed 236px.

- **Assistant:** header (sparkle badge + "Assistant" + green dot + minimize +
  close), message bubbles (agent = surface-0 + hairline, tl-radius 3; you =
  `--primary` bubble, tr-radius 3), "drafting…" line, composer (input + ink
  send). Wire to the existing AiChatPanel connector where practical.
- **Video call:** 150px tile (dark gradient + centered `Avatar(lg)`), `● 12:04`
  timer chip, name chip, self-view thumb; control bar with round mic / camera
  (outline) + destructive **leave**. Each island independently dismissable.

### Overlays / popovers

One open at a time; full-screen backdrop closes on click (transparent for
menus, `hsl(0 0% 0% /.32)` for palette). Anchored via `getBoundingClientRect`
(below-left default; notif below-right; surfaces to the right; palette centered
at `top:12%`). Menus: workspace, new, notifications, profile, row-context (0285
already provides this on explorer rows), surfaces roll-out, command palette
(reuse `GlobalSearch`/CommandPalette where possible).

## State additions (workbench store)

- `activeSurface: SurfaceId` (default `'explorer'`) + `setActiveSurface`.
- `navPinned: SurfaceId[]` (default `['explorer','inbox','tasks']`) +
  `toggleNavPinned` (persisted).
- `floatAi: boolean`, `floatCall: boolean` (default true; ephemeral or
  persisted-off is fine) + setters.
- Reuse existing `focus`, `sidebarCollapsed` (sidebar hidden in focus), `left`/
  `right` open for showRight, tabs, etc. The floating look does NOT need
  `react-resizable-panels`; sidebar width comes from a `sidebarWidth` setting
  (230–320, default 264) — a plain flex-basis, resizable later.

## Tweakable knobs → app settings/flags

- `sidebarWidth` (230–320, default 264).
- `focusMode` (bool) — already exists (`focus`); hides both side islands.
- `accent` (mono | linear) — the existing `data-variant='linear'` override.

## Approach / file plan

- **Tokens:** `packages/ui/src/theme/tokens.css` — add the `.wb-root` /
  `.wb-root.dark` block (+ `--canvas/--island/--island-b/--isl-shadow/
--pop-shadow`). `packages/ui/tailwind` (or app tailwind config) — add
  `island`, `island-b`, `canvas` colors + `shadow-isl`/`shadow-pop`.
- **Frame:** new `apps/web/src/workbench/FloatingFrame.tsx` renders the islands
  layout; `ShellFrame`'s pinned path renders it (Zen/focus path unchanged, just
  restyled to canvas). Keep the drag/arrange overlays working.
- **Sidebar:** new `apps/web/src/workbench/SidebarIslands.tsx` (top + bottom
  islands + surfaces model) replacing the flat `Sidebar` usage in the floating
  frame; keep `Sidebar.tsx` for MobileShell or delete if unused.
- **Surfaces model:** `apps/web/src/workbench/surfaces.ts` — the SURFACES list,
  content adapters (wire to real hooks; representative fallback data allowed).
- **Editor header + pills:** add a header row to the floating editor region;
  restyle `TabBar.tsx` to pills (or a floating variant).
- **Right island:** reuse/adapt `ContextPanel.tsx`.
- **Status bar:** reuse/adapt `StatusBar.tsx`.
- **Floating dock:** new `apps/web/src/workbench/FloatingDock.tsx` (Assistant +
  VideoCall). Assistant reuses `views/AiChatPanel` connector where possible.
- **Popovers:** new `apps/web/src/workbench/FloatingMenus.tsx` (anchored
  popovers) or reuse `@xnetjs/ui` `Popover`/`Menu`.

## Implementation Checklist

- [x] Add `.wb-root` / `.wb-root.dark` warm-clay token override + `--canvas`,
      `--island`, `--island-b`, `--isl-shadow`, `--pop-shadow` to
      `tokens.css`; expose `island` / `island-b` / `canvas` colors and
      `shadow-isl` / `shadow-pop` in the Tailwind theme.
- [x] `FloatingFrame`: root canvas column (11px pad / 8px gap), body row with
      sidebar + editor (base surface) + right island, status-bar island; wire
      `showSidebar`/`showRight`/`focus` from the store.
- [x] Sidebar top island: avatar→profile, workspace selector→workspace menu,
      Search→palette, New→new menu, primary `navPinned` rows (active wash +
      counts), More→surfaces flyout with hidden count.
- [x] Sidebar bottom island: contextual header + body switched by
      `activeSurface`; Explorer (pinned + folder tree, reusing existing
      explorer views + 0285 row context menu), Tasks (Checkbox + done/total),
      Inbox / Chats / generic surfaces wired to representative data (real hooks
      where wired).
- [x] Surfaces roll-out flyout: navigate on row click, pin toggle mutates
      `navPinned`; anchored to the right of the More row.
- [x] Store: `activeSurface` + `setActiveSurface`; `navPinned` +
      `toggleNavPinned` (persisted); `floatAi`/`floatCall` + setters;
      `sidebarWidth` setting.
- [x] Editor header (50px): sidebar toggle, breadcrumb, facepile + `+N`, Share
      primary Button, comments toggle (accent when right open), notifications
      bell + dot → notif menu, ⋯ more.
- [x] Pill-tab strip (42px): pills from the tab store (active accent wash,
      close ×, `+` new-tab), split-view + history icon buttons on the right.
- [x] Right island: underline Tabs (Comments/Properties/Activity) + close;
      comments composer, properties key/values, activity timeline.
- [x] Status-bar island (32px): synced StatusDot, branch, peers; words, ⌘K,
      saved, theme toggle.
- [x] Floating dock: Assistant island (`flex:1`, bubbles + drafting + composer,
      minimize/close) + Video-call island (236px, tile + controls + leave),
      each dismissable; container positioned with the 8px-gap math + focus/
      hidden-panel fallbacks; `pointer-events` correct.
- [x] Popovers: workspace, new, notifications, profile, surfaces, command
      palette — single-open, backdrop-close, anchored; palette centered with
      dimmed backdrop. Reuse `@xnetjs/ui` primitives / existing GlobalSearch.
- [ ] Light + dark parity: content stays the brightest plane in both; toggle in
      the status bar flips `dark`.
- [x] MobileShell unaffected (or given the canvas background); compact width
      still routes to it.

## Validation Checklist

- [ ] Update/replace affected tests (shell-tripwire, shell-escape,
      state.test, tabs.test, SurfaceDock/ArrangeOverlay as needed); add a
      smoke test for the floating frame + surfaces model.
- [ ] `pnpm test`, typecheck, lint, Fallow + humane-pattern gates pass; add a
      Changelog fragment (`platform`); private app → no changeset; DCO sign-off.
- [ ] Live-render verification in the worktree preview (light + dark): islands,
      surface switching, pin toggle, tabs, floating dock, popovers.

## References

- Design handoff: "xNet Workbench Redesign — Floating Islands" (light + dark,
  hi-fi); primary file `Workbench — Floating.dc.html`.
- Repo — frame: [`ShellFrame.tsx`](../../apps/web/src/workbench/ShellFrame.tsx),
  [`Workbench.tsx`](../../apps/web/src/workbench/Workbench.tsx),
  [`EditorArea.tsx`](../../apps/web/src/workbench/EditorArea.tsx),
  [`Sidebar.tsx`](../../apps/web/src/workbench/Sidebar.tsx),
  [`StatusBar.tsx`](../../apps/web/src/workbench/StatusBar.tsx),
  [`ContextPanel.tsx`](../../apps/web/src/workbench/ContextPanel.tsx),
  [`TabBar.tsx`](../../apps/web/src/workbench/TabBar.tsx),
  [`state.ts`](../../apps/web/src/workbench/state.ts),
  [`layout-tree.ts`](../../apps/web/src/workbench/layout-tree.ts)
- Repo — surfaces: [`views/Explorer.tsx`](../../apps/web/src/workbench/views/Explorer.tsx),
  [`views/ExplorerFolderTree.tsx`](../../apps/web/src/workbench/views/ExplorerFolderTree.tsx),
  [`views/explorer-rows.tsx`](../../apps/web/src/workbench/views/explorer-rows.tsx),
  [`views/TasksPanel.tsx`](../../apps/web/src/workbench/views/TasksPanel.tsx),
  [`views/AiChatPanel.tsx`](../../apps/web/src/workbench/views/AiChatPanel.tsx)
- Repo — tokens/primitives: [`theme/tokens.css`](../../packages/ui/src/theme/tokens.css),
  `packages/ui/src/primitives/{Button,Checkbox,Input,Tabs,Badge,IconButton}.tsx`,
  [`composed/StatusDot.tsx`](../../packages/ui/src/composed/StatusDot.tsx),
  [`components/DIDAvatar.tsx`](../../packages/ui/src/components/DIDAvatar.tsx)
- Predecessor: [`0284_[x]_COHERENT_SINGLE_SHELL_REDESIGN.md`](./0284_[x]_COHERENT_SINGLE_SHELL_REDESIGN.md)
