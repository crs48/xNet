/**
 * @xnetjs/canvas-core - Shared Canvas v3 spatial contracts.
 */

export type Point = {
  x: number
  y: number
}

export type Size = {
  width: number
  height: number
}

export type Rect = Point & Size

export type TileCoord = {
  tx: number
  ty: number
}

export type TileAddress = {
  z: number
  x: number
  y: number
}

export type LocalPoint = Point

export type WorldPoint = {
  tile: TileCoord
  local: LocalPoint
}

export type CanvasObjectKind =
  | 'page'
  | 'database'
  | 'external-reference'
  | 'media'
  | 'shape'
  | 'note'
  | 'group'

export type CanvasObjectTypeCounts = Partial<Record<CanvasObjectKind, number>>

export type CanvasDensityGrid = {
  columns: number
  rows: number
  values: readonly number[]
}

export type CanvasTileClusterSummary = {
  id: string
  bounds: Rect
  objectCount: number
  dominantKind: CanvasObjectKind
  sampleObjectIds: readonly string[]
}

export type CanvasTileSummary = {
  tileId: string
  address: TileAddress
  bounds: Rect
  objectCount: number
  edgeCount: number
  typeCounts: CanvasObjectTypeCounts
  density: CanvasDensityGrid
  clusters: readonly CanvasTileClusterSummary[]
  activePresenceCount: number
  dirty: boolean
  stale: boolean
}

export type MinimapSummaryMode = 'small-scene' | 'large-scene' | 'huge-scene'

export type MinimapSummary = {
  bounds: Rect
  mode: MinimapSummaryMode
  totalObjectCount: number
  totalEdgeCount: number
  activePresenceCount: number
  tiles: readonly CanvasTileSummary[]
}
