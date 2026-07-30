/**
 * Stacking layer for portalled popups (selects, menus, popovers, tooltips).
 *
 * Base UI portals these into <body>, so they land in the ROOT stacking context
 * as siblings of the app root — and the Positioner (the element the portal
 * actually paints) has `z-index: auto`. A `z-50` on the Popup *inside* it is
 * scoped to the positioner's own context and cannot lift the whole subtree, so
 * any app overlay with a real z-index (the grid field menu's `z-40` scrim, a
 * modal's `z-50`) paints on top of the dropdown — the field-type select in the
 * table view rendered behind its own popover for exactly this reason.
 *
 * Put the z-index on the POSITIONER, above the shell's overlay range (app
 * overlays top out at `z-[200]`; devtools at `z-[10000]`), so a dropdown opened
 * from inside any of them stays clickable.
 */
export const POPUP_LAYER = 'z-[10050]'
