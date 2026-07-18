/**
 * Page geometry (0346, Phase 4) — one substrate, three arrangements.
 *
 * A page's frames arrange as a linear `stack` (document), a tiled
 * `grid` (dashboard), or free `space` (canvas). Geometry is a VIEW
 * property over one frame set: toggling arranges, it never converts —
 * the BlockSuite page/edgeless proof applied to frames. The invariant
 * is enforced by `toggleGeometry` (and its round-trip test): the frame
 * set — ids, sources, view types, configs — passes through unchanged;
 * the only permitted write is filling a MISSING `layout` with defaults
 * on first entry into grid/space.
 */

import type { FrameDef } from './types.js'

export type PageGeometry = 'stack' | 'grid' | 'space'

/** Grid geometry defaults (columns of a 12-unit grid, like dashboards). */
const GRID_DEFAULT_W = 6
const GRID_DEFAULT_H = 4
/** Space geometry defaults (px). */
const SPACE_DEFAULT_W = 480
const SPACE_DEFAULT_H = 320
const SPACE_STEP = 40

/** Stack order — fractional sortKey compared by code units (invariant). */
export function orderForStack(frames: readonly FrameDef[]): FrameDef[] {
  return [...frames].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
}

/**
 * Fill missing layouts for a non-stack geometry. Frames that already
 * carry a layout are returned UNTOUCHED (same object identity).
 */
export function withLayoutDefaults(
  frames: readonly FrameDef[],
  geometry: PageGeometry
): FrameDef[] {
  if (geometry === 'stack') return [...frames]
  let index = 0
  return frames.map((frame) => {
    const i = index++
    if (frame.layout) return frame
    return geometry === 'grid'
      ? {
          ...frame,
          layout: {
            x: (i % 2) * GRID_DEFAULT_W,
            y: Math.floor(i / 2) * GRID_DEFAULT_H,
            w: GRID_DEFAULT_W,
            h: GRID_DEFAULT_H
          }
        }
      : {
          ...frame,
          layout: {
            x: i * SPACE_STEP,
            y: i * SPACE_STEP,
            w: SPACE_DEFAULT_W,
            h: SPACE_DEFAULT_H
          }
        }
  })
}

/**
 * Toggle a page's geometry: returns the SAME frame set, arranged for
 * the target geometry. Never drops, reorders (beyond stack sorting), or
 * rewrites a frame — only missing layouts gain defaults.
 */
export function toggleGeometry(
  frames: readonly FrameDef[],
  to: PageGeometry
): { geometry: PageGeometry; frames: FrameDef[] } {
  return {
    geometry: to,
    frames: to === 'stack' ? orderForStack(frames) : withLayoutDefaults(frames, to)
  }
}

/** Stable identity signature for the round-trip invariant. */
export function frameSetSignature(frames: readonly FrameDef[]): string {
  return [...frames]
    .map(
      (f) =>
        `${f.id}|${JSON.stringify(f.source)}|${f.viewType}|${JSON.stringify(f.config ?? null)}|${f.tier}`
    )
    .sort()
    .join('\n')
}
