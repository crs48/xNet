/**
 * Drawing Persistence Tests
 *
 * Tests for Yjs-backed stroke persistence and deterministic SVG export.
 */

import type { DrawingPath } from '../drawing/types'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
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
} from '../drawing/persistence'

function createPath(overrides: Partial<DrawingPath> = {}): DrawingPath {
  return {
    id: 'path-1',
    points: [
      { x: 10, y: 20, pressure: 0.5 },
      { x: 30, y: 40, pressure: 0.75 }
    ],
    strokeWidth: 4,
    strokeColor: '#0f172a',
    opacity: 0.8,
    timestamp: 100,
    ...overrides
  }
}

describe('drawing persistence', () => {
  it('persists drawing paths in the canvas Y.Doc', () => {
    const doc = new Y.Doc()
    const path = createPath()

    const persisted = persistCanvasDrawingPath(doc, path)

    expect(getCanvasDrawingPathsMap(doc).has(path.id)).toBe(true)
    expect(readCanvasDrawingPaths(doc)).toEqual([persisted])
  })

  it('clones persisted paths so caller mutations do not change stored paths', () => {
    const doc = new Y.Doc()
    const path = createPath()

    persistCanvasDrawingPath(doc, path)
    path.points[0].x = 999

    expect(readCanvasDrawingPaths(doc)[0].points[0].x).toBe(10)
  })

  it('reads paths in stable timestamp and id order', () => {
    const doc = new Y.Doc()
    const later = createPath({ id: 'path-b', timestamp: 200 })
    const firstById = createPath({ id: 'path-a', timestamp: 100 })
    const secondById = createPath({ id: 'path-c', timestamp: 100 })

    persistCanvasDrawingPaths(doc, [later, secondById, firstById])

    expect(readCanvasDrawingPaths(doc).map((path) => path.id)).toEqual([
      'path-a',
      'path-c',
      'path-b'
    ])
  })

  it('removes and clears drawing paths', () => {
    const doc = new Y.Doc()

    persistCanvasDrawingPaths(doc, [
      createPath({ id: 'path-a' }),
      createPath({ id: 'path-b', timestamp: 200 })
    ])

    expect(removeCanvasDrawingPath(doc, 'path-a')).toBe(true)
    expect(removeCanvasDrawingPath(doc, 'missing')).toBe(false)
    expect(readCanvasDrawingPaths(doc).map((path) => path.id)).toEqual(['path-b'])
    expect(clearCanvasDrawingPaths(doc)).toBe(1)
    expect(clearCanvasDrawingPaths(doc)).toBe(0)
  })

  it('uses the expected Yjs map key', () => {
    const doc = new Y.Doc()

    expect(getCanvasDrawingPathsMap(doc)).toBe(doc.getMap(CANVAS_DRAWING_PATHS_MAP_KEY))
  })
})

describe('drawing export', () => {
  it('computes drawing bounds from smoothed render points when available', () => {
    const path = createPath({
      smoothed: [
        { x: -5, y: 0 },
        { x: 15, y: 30 }
      ]
    })

    expect(getCanvasDrawingPathsBounds([path])).toEqual({
      x: -5,
      y: 0,
      width: 20,
      height: 30
    })
  })

  it('creates path data from render points', () => {
    const path = createPath({
      points: [
        { x: 10.25, y: 20.5, pressure: 0.5 },
        { x: 30, y: 40, pressure: 0.5 }
      ]
    })

    expect(createCanvasDrawingSvgPathData(path)).toBe('M 10.25 20.5 L 30 40')
  })

  it('creates a JSON export document with stable path ordering', () => {
    const document = createCanvasDrawingExportDocument(
      [createPath({ id: 'path-b', timestamp: 200 }), createPath({ id: 'path-a', timestamp: 100 })],
      { exportedAt: 1234 }
    )

    expect(document.schemaVersion).toBe(CANVAS_DRAWING_EXPORT_SCHEMA_VERSION)
    expect(document.exportedAt).toBe(1234)
    expect(document.paths.map((path) => path.id)).toEqual(['path-a', 'path-b'])
  })

  it('exports strokes and dots as deterministic SVG', () => {
    const svg = exportCanvasDrawingPathsAsSvg(
      [
        createPath({ id: 'line-a' }),
        createPath({
          id: 'dot-a',
          points: [{ x: 50, y: 60, pressure: 0.5 }],
          timestamp: 200
        })
      ],
      {
        exportedAt: 1234,
        padding: 0,
        title: 'Board <Ink>',
        includeMetadata: true
      }
    )

    expect(svg).toContain('data-xnet-canvas-drawing-export="true"')
    expect(svg).toContain('<title>Board &lt;Ink&gt;</title>')
    expect(svg).toContain('<metadata>{&quot;schemaVersion&quot;:1')
    expect(svg).toContain('<path id="line-a"')
    expect(svg).toContain('d="M 10 20 L 30 40"')
    expect(svg).toContain('<circle id="dot-a"')
    expect(svg).toContain('cx="50"')
    expect(svg).toContain('cy="60"')
  })

  it('can omit SVG metadata', () => {
    const svg = exportCanvasDrawingPathsAsSvg([createPath()], { includeMetadata: false })

    expect(svg).not.toContain('<metadata>')
  })
})
