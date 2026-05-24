/**
 * @xnetjs/canvas-core - Canvas v3 tile, camera, LOD, and provider contracts.
 */

export type {
  Point,
  Size,
  Rect,
  TileCoord,
  TileAddress,
  LocalPoint,
  WorldPoint,
  CanvasObjectKind,
  CanvasObjectTypeCounts,
  CanvasDensityGrid,
  CanvasTileClusterSummary,
  CanvasTileSummary,
  MinimapSummaryMode,
  MinimapSummary
} from './types'

export {
  DEFAULT_CANVAS_TILE_SIZE,
  normalizeWorldPoint,
  createWorldPointFromCanvasPoint,
  worldPointToAnchorLocal,
  anchorLocalToWorldPoint,
  translateWorldPoint,
  compareTileCoord
} from './coordinates'

export {
  createTileId,
  parseTileId,
  getTileBounds,
  getTileCoverageForRect,
  getTileCoverageForWorldPoints,
  listTileAddresses,
  type TileCoverageRange
} from './tiles'

export {
  createCanvasCamera,
  getCameraWorldCenter,
  screenToWorldPoint,
  worldToScreenPoint,
  getCameraVisibleWorldCorners,
  getCameraVisibleTileCoverage,
  getCameraVisibleLegacyRect,
  type CanvasCameraState,
  type CreateCanvasCameraInput
} from './camera'

export {
  chooseObjectLod,
  type CanvasLodTier,
  type LodBudgets,
  type CanvasObjectSummary,
  type ChooseObjectLodInput
} from './lod'

export type {
  ViewportInterest,
  CanvasObjectRecord,
  VectorTilePayload,
  RasterTileRef,
  ThumbnailSpritePayload,
  CanvasOverlayRecord,
  CanvasSceneSnapshot,
  CanvasTileMutation,
  CanvasMutationReceipt,
  CanvasSourceDocHandle,
  MinimapSummaryRequest,
  CanvasSceneProvider
} from './provider'

export {
  createEmptyMinimapSummary,
  mergeCanvasObjectTypeCounts,
  getDominantCanvasObjectKind,
  getMinimapSummaryMode,
  getBoundsForTileSummaries,
  createMinimapSummaryFromTileSummaries
} from './summary'

export {
  createSyntheticCanvasScene,
  type SyntheticCanvasSceneOptions,
  type SyntheticCanvasScene
} from './synthetic'
