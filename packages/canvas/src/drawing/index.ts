/**
 * Drawing Module
 *
 * Freehand drawing tools for canvas.
 */

// Types
export type { Point, PressurePoint, DrawingPath, DrawingTool } from './types'

export { DEFAULT_DRAWING_TOOL, STROKE_COLORS, STROKE_SIZES } from './types'

// Drawing Tool Controller
export { DrawingToolController, drawPath, drawPaths } from './drawing-tool'

// Persistence and export
export {
  CANVAS_DRAWING_EXPORT_SCHEMA_VERSION,
  CANVAS_DRAWING_PATHS_MAP_KEY,
  clearCanvasDrawingPaths,
  createCanvasDrawingExportDocument,
  createCanvasDrawingSvgPathData,
  exportCanvasDrawingPathsAsSvg,
  getCanvasDrawingPathsBounds,
  getCanvasDrawingPathsMap,
  persistCanvasDrawingPath,
  persistCanvasDrawingPaths,
  readCanvasDrawingPaths,
  removeCanvasDrawingPath
} from './persistence'
export type {
  CanvasDrawingBounds,
  CanvasDrawingExportDocument,
  CanvasDrawingSvgExportOptions
} from './persistence'

// Components
export { DrawingLayer } from './DrawingLayer'
export type { DrawingLayerProps, DrawingLayerRef } from './DrawingLayer'

export { DrawingToolbar } from './DrawingToolbar'
export type { DrawingToolbarProps } from './DrawingToolbar'
