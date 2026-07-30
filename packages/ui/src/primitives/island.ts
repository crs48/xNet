/**
 * The workbench island recipe (0286 floating islands, 0299 two planes).
 *
 * Every floating element in the shell shares ONE fill. Chrome islands sit
 * flat — hairline border only; overlays add `shadow-pop`, and elevation alone
 * carries the "hovering" cue. Never a different fill colour.
 *
 * This lived as a `const ISLAND = '…'` copy-pasted across the workbench
 * (FloatingFrame, SidebarIslands, MobileShell) plus inline strings elsewhere,
 * which is how CommentPopover drifted off it unnoticed (0375). Compose from
 * here instead.
 *
 * Note `--island-pop` is a legacy alias of `--island-b`, kept only so existing
 * `bg-island-pop` consumers need no edits — new code targets `bg-island-b`.
 */

/** Border + fill. The minimum that makes something read as an island. */
export const ISLAND_SURFACE = 'border border-hairline bg-island-b'

/** Chrome islands: sidebars, docks, status bar. Flat, 16px radius. */
export const ISLAND_CHROME = `overflow-hidden rounded-2xl ${ISLAND_SURFACE}`

/** Overlay islands: modals, popovers, the comment island. Elevated. */
export const ISLAND_OVERLAY = `overflow-hidden rounded-2xl ${ISLAND_SURFACE} shadow-pop`
