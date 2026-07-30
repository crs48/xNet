/**
 * Frame adapters (0346) — shims from the pre-frame container contracts
 * onto FrameDef, so the editor's embed blocks and the canvas's node
 * cards address the same compositional unit without a data migration.
 */

import type { FrameDef, FrameTier } from './types.js'

/** Editor `databaseEmbed` block props → FrameDef (block id = frame id). */
export function frameFromDatabaseEmbed(input: {
  blockId: string
  databaseId: string
  viewType: string
  viewConfig: Record<string, unknown>
  tier?: FrameTier
}): FrameDef {
  return {
    id: `block:${input.blockId}`,
    source: { kind: 'node', nodeId: input.databaseId },
    viewType: input.viewType || 'table',
    config: input.viewConfig,
    tier: input.tier ?? 'live',
    sortKey: ''
  }
}

/** Editor `pageEmbed` block props → FrameDef (summary transclusion). */
export function frameFromPageEmbed(input: { blockId: string; nodeId: string }): FrameDef {
  return {
    id: `block:${input.blockId}`,
    source: { kind: 'node', nodeId: input.nodeId },
    viewType: 'page-preview',
    tier: 'summary',
    sortKey: ''
  }
}

/**
 * Canvas node card → FrameDef. Canvas objects reference workspace nodes
 * through `sourceId`/`docId` properties (0277); spatial placement maps
 * onto the frame's `layout` so a canvas is readable as "frames in space
 * geometry" (0346 Phase 4).
 */
export function frameFromCanvasNode(input: {
  objectId: string
  sourceNodeId: string
  viewType?: string
  x: number
  y: number
  width?: number
  height?: number
  tier?: FrameTier
}): FrameDef {
  return {
    id: `canvas:${input.objectId}`,
    source: { kind: 'node', nodeId: input.sourceNodeId },
    viewType: input.viewType ?? 'table',
    tier: input.tier ?? 'shell',
    sortKey: '',
    layout: {
      x: input.x,
      y: input.y,
      w: input.width ?? 320,
      h: input.height ?? 240
    }
  }
}
