# The xNet Workbench

The web app's shell (exploration 0166) is a fixed-region workbench in the
VS Code mold: predictable named regions, everything opens as a tab, one
command palette, one drag model. The shell lives in
`apps/web/src/workbench/`; the content views it hosts are unchanged.

## Regions

| Region       | Component                     | Notes                                                                       |
| ------------ | ----------------------------- | --------------------------------------------------------------------------- |
| Rail (44px)  | `Rail.tsx`                    | Search, Explorer, Tasks, Data, contributed items; identity + settings below |
| Left Panel   | `PanelViewHost` slot `left`   | One view at a time (Explorer / Tasks / Data / plugin views)                 |
| Editor Area  | `EditorArea.tsx`              | Tab bar per group, optional second group (split); router-authoritative      |
| Right Panel  | `ContextPanel.tsx`            | Contextual sections published by the active view via `useContextPanel`      |
| Bottom Panel | `PanelViewHost` slot `bottom` | Tray: Shelf, Capture, Notifications, Sync, query Console                    |
| Status Bar   | `StatusBar.tsx` (24px, mono)  | Left = workspace scope, right = view scope + theme toggle                   |

Layout, open tabs, pins, recents, the shelf, and zen snapshots persist in
`localStorage` under `xnet:workbench:v1` (zustand). Panel _sizes_ persist
via `react-resizable-panels`' `useDefaultLayout`.

## Tabs

Everything opens as a tab: pages, databases, canvases, dashboards, saved
views (`/view/$viewId`), the task board, and the data workspace. The
router stays authoritative — navigating opens-or-activates the matching
tab, so deep links, back/forward, and old bookmarks keep working. Single
clicks from the Explorer/palette open _preview_ tabs (italic) that are
replaced by the next preview; editing or double-clicking promotes them.
Background tabs are unmounted entirely, so they hold no live Y.Doc
subscriptions.

## Keyboard map (core)

| Chord        | Action                                                |
| ------------ | ----------------------------------------------------- |
| ⌘K / ⌘P      | Palette / quick-open (`>` = command mode)             |
| ⌘B, ⌘\\, ⌘J  | Toggle left / right / bottom panel                    |
| ⌘.           | Zen mode (Esc Esc exits; layout restored bit-for-bit) |
| ⌘T / ⌘W      | New page / close tab                                  |
| ⌃Tab / ⌃⇧Tab | Cycle tabs                                            |
| ⌘1 / ⌘2      | Focus editor group                                    |
| ⌘⇧\\         | Split editor                                          |
| F6 / ⇧F6     | Cycle focus through regions                           |

Every command lives in the `CommandRegistry` (`@xnetjs/plugins`) and is
listed in the palette with its chord.

## Contribution points (containers vs items)

Plugins contribute _items_ into fixed containers; they cannot invent new
chrome:

- **Rail items / left-panel views** — `SidebarContribution` (a `panel`
  component becomes a left-panel view)
- **Status items** — `StatusBarContribution` (left = workspace scope,
  right = view scope)
- **Palette commands** — `CommandContribution` (mirrored into the
  `CommandRegistry`, chords included)
- **Context sections** — views call `useContextPanel(ownerId, sections)`
- **Panel views** — `registerPanelView(slot, view)` for built-ins and
  bridged plugin views
- **Widgets** — `WidgetContribution` (dashboards, 0162) is unchanged

## Drag model

Every draggable entity carries `application/x-xnet-node`
(`packages/ui/src/dnd/node-transfer.ts`), plus the canvas MIME when the
schema id is known. Drops create _references_, never copies: editor →
wikilink chip, relation cell → link, canvas → source-backed card, tab
bar → tab, editor edge → split, Shelf (bottom tray) → held reference.

## Theme

Tokens (`packages/ui/src/theme/tokens.css`) are a single APCA-tuned
monochrome ramp per mode: `surface-0/1/2`, `ink-1/2/3`, `hairline`,
`accent-ink`. Chrome sits on `surface-1/2` with `ink-2` text — dimmer
than the work; the editor area is the only `surface-0` region. Hue is
reserved for user data. A `true-black` variant
(`html.dark[data-variant='true-black']`) collapses dark surfaces to
`#000` for OLED — toggle via `useTheme().setVariant('true-black')`.
