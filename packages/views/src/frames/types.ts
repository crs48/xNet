/**
 * The Frame contract (exploration 0346, Phase 2).
 *
 * A Frame is the UI's compositional unit: a live, placeable rendering of
 * a node, a query, or a curated collection through a registered view.
 * The repo grew four independent half-implementations of this idea —
 * editor embed blocks, canvas cards, dashboard widgets, and the
 * workbench tab — this contract is the one shape they converge on.
 */

import type { SavedViewDescriptor } from '@xnetjs/data'

/**
 * What the frame shows. The `query` / `collection` split is the
 * Set-vs-Collection duality (Anytype/Notion/Tana all converged on it):
 * a live query owns its membership; a collection is curated by hand.
 */
export type FrameSource =
  | { kind: 'node'; nodeId: string }
  | { kind: 'query'; descriptor: SavedViewDescriptor }
  | { kind: 'collection'; nodeIds: string[] }

/**
 * Cost ladder — adopted from CanvasPreviewTier (0277). Containers bound
 * how much a frame may cost: `live` mounts the full reactive view,
 * `shell` mounts chrome without live subscriptions, `thumbnail` renders
 * a static miniature, `summary` a text/count line.
 */
export type FrameTier = 'summary' | 'thumbnail' | 'shell' | 'live'

export interface FrameDef {
  id: string
  source: FrameSource
  /** ViewRegistry type ('table' | 'board' | 'map' | plugin types…). */
  viewType: string
  /** Per-view presentation config (DatabaseViewConfig subset etc.). */
  config?: Record<string, unknown>
  tier: FrameTier
  /** Stack order — fractional sortKey (code-unit collation invariant). */
  sortKey: string
  /** Present only when the page geometry is grid/space (0346 Phase 4). */
  layout?: { x: number; y: number; w: number; h: number }
}

/**
 * Transclusion depth clamp (0346): a frame inside a frame renders one
 * level; anything deeper degrades to a summary card. Guards A→B→A
 * cycles and the Dataview-style query-over-embed instability.
 */
export const FRAME_MAX_DEPTH = 2
