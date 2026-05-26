/**
 * Drawing Persistence
 *
 * Yjs storage and deterministic export helpers for freehand canvas strokes.
 */

import type { DrawingPath, Point, PressurePoint } from './types'
import * as Y from 'yjs'

export const CANVAS_DRAWING_PATHS_MAP_KEY = 'drawingPaths'
export const CANVAS_DRAWING_EXPORT_SCHEMA_VERSION = 1

export type CanvasDrawingBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasDrawingExportDocument = {
  schemaVersion: typeof CANVAS_DRAWING_EXPORT_SCHEMA_VERSION
  exportedAt: number
  bounds: CanvasDrawingBounds
  paths: DrawingPath[]
}

export type CanvasDrawingSvgExportOptions = {
  bounds?: CanvasDrawingBounds
  exportedAt?: number
  includeMetadata?: boolean
  padding?: number
  title?: string
}

// ─── Yjs Storage ──────────────────────────────────────────────────────────────

export function getCanvasDrawingPathsMap<T = DrawingPath>(doc: Y.Doc): Y.Map<T> {
  return doc.getMap<T>(CANVAS_DRAWING_PATHS_MAP_KEY)
}

export function readCanvasDrawingPaths(doc: Y.Doc): DrawingPath[] {
  const paths: DrawingPath[] = []

  getCanvasDrawingPathsMap(doc).forEach((value) => {
    paths.push(cloneDrawingPath(value))
  })

  return paths.sort(compareDrawingPaths)
}

export function persistCanvasDrawingPath(doc: Y.Doc, path: DrawingPath): DrawingPath {
  const persisted = cloneDrawingPath(path)

  doc.transact(() => {
    getCanvasDrawingPathsMap(doc).set(persisted.id, persisted)
  })

  return persisted
}

export function persistCanvasDrawingPaths(doc: Y.Doc, paths: DrawingPath[]): DrawingPath[] {
  const persisted = paths.map(cloneDrawingPath)

  doc.transact(() => {
    const pathsMap = getCanvasDrawingPathsMap(doc)

    for (const path of persisted) {
      pathsMap.set(path.id, path)
    }
  })

  return persisted
}

export function removeCanvasDrawingPath(doc: Y.Doc, pathId: string): boolean {
  const pathsMap = getCanvasDrawingPathsMap(doc)
  const existed = pathsMap.has(pathId)

  if (existed) {
    doc.transact(() => {
      pathsMap.delete(pathId)
    })
  }

  return existed
}

export function clearCanvasDrawingPaths(doc: Y.Doc): number {
  const pathsMap = getCanvasDrawingPathsMap(doc)
  const removedCount = pathsMap.size

  if (removedCount > 0) {
    doc.transact(() => {
      pathsMap.clear()
    })
  }

  return removedCount
}

// ─── Export Model ─────────────────────────────────────────────────────────────

export function createCanvasDrawingExportDocument(
  paths: DrawingPath[],
  options: Pick<CanvasDrawingSvgExportOptions, 'bounds' | 'exportedAt'> = {}
): CanvasDrawingExportDocument {
  const normalizedPaths = paths.map(cloneDrawingPath).sort(compareDrawingPaths)

  return {
    schemaVersion: CANVAS_DRAWING_EXPORT_SCHEMA_VERSION,
    exportedAt: options.exportedAt ?? Date.now(),
    bounds: options.bounds ?? getCanvasDrawingPathsBounds(normalizedPaths),
    paths: normalizedPaths
  }
}

export function getCanvasDrawingPathsBounds(paths: DrawingPath[]): CanvasDrawingBounds {
  const points = paths.flatMap(getRenderableDrawingPoints).filter(isFinitePoint)

  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function createCanvasDrawingSvgPathData(path: DrawingPath): string {
  const points = getRenderableDrawingPoints(path).filter(isFinitePoint)

  if (points.length === 0) return ''

  const [first, ...rest] = points
  const commands = [`M ${formatSvgNumber(first.x)} ${formatSvgNumber(first.y)}`]

  for (const point of rest) {
    commands.push(`L ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`)
  }

  return commands.join(' ')
}

export function exportCanvasDrawingPathsAsSvg(
  paths: DrawingPath[],
  options: CanvasDrawingSvgExportOptions = {}
): string {
  const exportDocument = createCanvasDrawingExportDocument(paths, options)
  const padding = options.padding ?? 16
  const viewBox = createPaddedViewBox(exportDocument.bounds, padding)
  const title = options.title ?? 'xNet canvas drawing strokes'
  const metadata = options.includeMetadata === false ? '' : createSvgMetadata(exportDocument)
  const body = exportDocument.paths.map(createSvgElementForDrawingPath).filter(Boolean).join('\n  ')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${formatSvgNumber(Math.max(1, exportDocument.bounds.width + padding * 2))}" height="${formatSvgNumber(Math.max(1, exportDocument.bounds.height + padding * 2))}" role="img" data-xnet-canvas-drawing-export="true">`,
    `  <title>${escapeXml(title)}</title>`,
    metadata,
    body ? `  ${body}` : '',
    '</svg>'
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function cloneDrawingPath(path: DrawingPath): DrawingPath {
  return {
    ...path,
    points: path.points.map(clonePressurePoint),
    ...(path.smoothed ? { smoothed: path.smoothed.map(clonePoint) } : {})
  }
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y }
}

function clonePressurePoint(point: PressurePoint): PressurePoint {
  return { x: point.x, y: point.y, pressure: point.pressure }
}

function compareDrawingPaths(left: DrawingPath, right: DrawingPath): number {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp
  }

  return left.id.localeCompare(right.id)
}

function getRenderableDrawingPoints(path: DrawingPath): Point[] {
  return path.smoothed && path.smoothed.length > 0 ? path.smoothed : path.points
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function createPaddedViewBox(bounds: CanvasDrawingBounds, padding: number): string {
  const x = bounds.x - padding
  const y = bounds.y - padding
  const width = Math.max(1, bounds.width + padding * 2)
  const height = Math.max(1, bounds.height + padding * 2)

  return [x, y, width, height].map(formatSvgNumber).join(' ')
}

function createSvgElementForDrawingPath(path: DrawingPath): string {
  const points = getRenderableDrawingPoints(path).filter(isFinitePoint)
  const commonAttrs = [
    `id="${escapeXml(path.id)}"`,
    `stroke="${escapeXml(path.strokeColor)}"`,
    `stroke-width="${formatSvgNumber(path.strokeWidth)}"`,
    `opacity="${formatSvgNumber(path.opacity)}"`,
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
    'fill="none"',
    'vector-effect="non-scaling-stroke"'
  ].join(' ')

  if (points.length === 1) {
    const [point] = points
    return `<circle ${commonAttrs} cx="${formatSvgNumber(point.x)}" cy="${formatSvgNumber(point.y)}" r="${formatSvgNumber(Math.max(0.5, path.strokeWidth / 2))}" fill="${escapeXml(path.strokeColor)}" />`
  }

  const d = createCanvasDrawingSvgPathData(path)

  return d.length > 0 ? `<path ${commonAttrs} d="${escapeXml(d)}" />` : ''
}

function createSvgMetadata(exportDocument: CanvasDrawingExportDocument): string {
  return `  <metadata>${escapeXml(JSON.stringify(exportDocument))}</metadata>`
}

function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'

  return value
    .toFixed(3)
    .replace(/\.?0+$/, '')
    .replace(/^-0$/, '0')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
