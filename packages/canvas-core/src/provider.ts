/**
 * Canvas v3 scene provider contracts.
 */

import type { CanvasLodTier } from './lod'
import type {
  CanvasObjectKind,
  CanvasTileSummary,
  MinimapSummary,
  Point,
  Rect,
  WorldPoint
} from './types'

export type ViewportInterest = {
  viewport: {
    center: WorldPoint
    widthPx: number
    heightPx: number
    zoom: number
    velocityPxPerMs: Point
  }
  interaction: {
    selectedObjectIds: readonly string[]
    focusedObjectId?: string
    editingSourceNodeId?: string
  }
  budgets: {
    maxLiveDom: number
    maxShellDom: number
    maxTextureBytes: number
    maxDecodedTileBytes: number
  }
}

export type CanvasObjectRecord = {
  id: string
  kind: CanvasObjectKind
  sourceNodeId?: string
  sourceSchemaId?: string
  position: Rect & {
    rotation?: number
    zIndex?: number
  }
  display: {
    collapsed?: boolean
    styleVariant?: string
    thumbnailPolicy?: 'auto' | 'manual' | 'never'
  }
  preview: {
    title?: string
    subtitle?: string
    sourceVersion?: string
    thumbnailHash?: string
  }
}

export type VectorTilePayload = {
  tileId: string
  summary: CanvasTileSummary
}

export type RasterTileRef = {
  tileId: string
  sourceEpoch: string
  textureKey: string
  stale: boolean
}

export type ThumbnailSpritePayload = {
  objectId: string
  tileId: string
  bounds: Rect
  atlasKey: string
  uv: Rect
}

export type CanvasConnectorEndpoint = {
  objectId: string
  tileId: string
  anchor: Point
}

export type CanvasConnectorRecord = {
  id: string
  source: CanvasConnectorEndpoint
  target: CanvasConnectorEndpoint
  kind: 'line' | 'reference' | 'dependency'
  updatedAt?: number
}

export type CanvasOverlayRecord = {
  id: string
  bounds: Rect
  tier: CanvasLodTier
}

export type CanvasSceneSnapshot = {
  cameraEpoch: number
  rasterTiles: readonly RasterTileRef[]
  vectorTiles: readonly VectorTilePayload[]
  thumbnailSprites: readonly ThumbnailSpritePayload[]
  shellObjects: readonly CanvasObjectRecord[]
  liveObjects: readonly CanvasObjectRecord[]
  overlays: readonly CanvasOverlayRecord[]
}

export type CanvasObjectTombstone = {
  objectId: string
  moveId: string
  sourceTileId: string
  targetTileId: string
  deletedAt: number
  actorId?: string
}

export type CanvasTileMutation = {
  tileId: string
  objects: readonly CanvasObjectRecord[]
  deletedObjectIds: readonly string[]
  tombstones: readonly CanvasObjectTombstone[]
  moveId?: string
}

export type CanvasMutationReceipt = {
  mutationId: string
  tileIds: readonly string[]
  committedAt: number
}

export type CanvasSourceDocHandle = {
  sourceNodeId: string
  close: () => void
}

export type MinimapSummaryRequest = {
  bounds?: Rect
  widthPx: number
  heightPx: number
  maxTileSummaries: number
}

export type CanvasSceneProvider = {
  subscribeViewport: (
    interest: ViewportInterest,
    onSnapshot: (snapshot: CanvasSceneSnapshot) => void
  ) => () => void
  mutateTile: (input: CanvasTileMutation) => Promise<CanvasMutationReceipt>
  openSourceDoc: (sourceNodeId: string) => Promise<CanvasSourceDocHandle>
  getMinimapSummary: (input: MinimapSummaryRequest) => Promise<MinimapSummary>
}
