/**
 * Drawing Tools Tests
 *
 * Tests for freehand drawing with pressure sensitivity and Catmull-Rom smoothing.
 */

import type { DrawingPath } from '../drawing/types'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DrawingToolController, drawPath, drawPaths } from '../drawing/drawing-tool'

// ─── Mock Canvas ──────────────────────────────────────────────────────────────

function createMockContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1
  } as unknown as CanvasRenderingContext2D
}

function createMockCanvas(): HTMLCanvasElement & { mockCtx: CanvasRenderingContext2D } {
  const mockCtx = createMockContext()

  const canvas = {
    width: 800,
    height: 600,
    mockCtx,
    getContext: vi.fn(() => mockCtx),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    remove: vi.fn()
  } as unknown as HTMLCanvasElement & { mockCtx: CanvasRenderingContext2D }

  return canvas
}

// ─── DrawingToolController Tests ──────────────────────────────────────────────

describe('DrawingToolController', () => {
  let canvas: HTMLCanvasElement & { mockCtx: CanvasRenderingContext2D }
  let controller: DrawingToolController
  let completedPaths: DrawingPath[]

  beforeEach(() => {
    canvas = createMockCanvas()
    completedPaths = []
    controller = new DrawingToolController(canvas, (path) => completedPaths.push(path))
  })

  afterEach(() => {
    // No-op, canvas is mock
  })

  describe('constructor', () => {
    it('creates controller with canvas', () => {
      expect(controller).toBeDefined()
      expect(controller.getTool()).toEqual({
        type: 'pen',
        strokeWidth: 2,
        strokeColor: '#000000',
        opacity: 1
      })
    })

    it('throws if canvas has no 2D context', () => {
      const badCanvas = {
        getContext: vi.fn(() => null),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn()
      } as unknown as HTMLCanvasElement

      expect(() => {
        new DrawingToolController(badCanvas, vi.fn())
      }).toThrow('Failed to get 2D context')
    })
  })

  describe('setTool', () => {
    it('updates tool settings', () => {
      controller.setTool({
        type: 'highlighter',
        strokeWidth: 8,
        strokeColor: '#ff0000',
        opacity: 0.5
      })

      const tool = controller.getTool()
      expect(tool.type).toBe('highlighter')
      expect(tool.strokeWidth).toBe(8)
      expect(tool.strokeColor).toBe('#ff0000')
      expect(tool.opacity).toBe(0.5)
    })

    it('merges partial updates', () => {
      controller.setTool({ strokeColor: '#00ff00' })

      const tool = controller.getTool()
      expect(tool.strokeColor).toBe('#00ff00')
      expect(tool.strokeWidth).toBe(2) // Default
    })
  })

  describe('drawing lifecycle', () => {
    it('captures drawing path on pointer events', () => {
      // Start drawing
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 100,
        y: 100
      })

      expect(controller.getIsDrawing()).toBe(true)

      // Move
      controller.onPointerMove({ pressure: 0.6 } as PointerEvent, { x: 150, y: 120 })
      controller.onPointerMove({ pressure: 0.7 } as PointerEvent, { x: 200, y: 140 })

      // End drawing
      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(controller.getIsDrawing()).toBe(false)
      expect(path).not.toBeNull()
      expect(path!.points).toHaveLength(3)
      expect(completedPaths).toHaveLength(1)
    })

    it('ignores right-click', () => {
      controller.onPointerDown({ pointerId: 1, button: 2, pressure: 0.5 } as PointerEvent, {
        x: 100,
        y: 100
      })

      expect(controller.getIsDrawing()).toBe(false)
    })

    it('ignores move when not drawing', () => {
      controller.onPointerMove({ pressure: 0.5 } as PointerEvent, { x: 100, y: 100 })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path).toBeNull()
    })
  })

  describe('pressure sensitivity', () => {
    it('captures pressure data', () => {
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.3 } as PointerEvent, {
        x: 0,
        y: 0
      })

      controller.onPointerMove({ pressure: 0.8 } as PointerEvent, { x: 50, y: 50 })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path!.points[0].pressure).toBe(0.3)
      expect(path!.points[1].pressure).toBe(0.8)
    })

    it('defaults pressure to 0.5 when not provided', () => {
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0 } as PointerEvent, {
        x: 0,
        y: 0
      })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path!.points[0].pressure).toBe(0.5)
    })
  })

  describe('path smoothing', () => {
    it('smooths path with Catmull-Rom', () => {
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 0,
        y: 0
      })

      // Add multiple points for smoothing
      for (let i = 1; i <= 10; i++) {
        controller.onPointerMove({ pressure: 0.5 } as PointerEvent, {
          x: i * 10,
          y: Math.sin(i) * 10
        })
      }

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path!.smoothed).toBeDefined()
      expect(path!.smoothed!.length).toBeGreaterThan(path!.points.length)
    })

    it('does not smooth paths with less than 3 points', () => {
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 0,
        y: 0
      })

      controller.onPointerMove({ pressure: 0.5 } as PointerEvent, { x: 10, y: 10 })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      // smoothed should be the original points for short paths
      expect(path!.smoothed!.length).toBe(2)
    })
  })

  describe('tool settings in path', () => {
    it('applies tool settings to completed path', () => {
      controller.setTool({
        type: 'pen',
        strokeWidth: 5,
        strokeColor: '#ff0000',
        opacity: 0.5
      })

      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 0,
        y: 0
      })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path!.strokeWidth).toBe(5)
      expect(path!.strokeColor).toBe('#ff0000')
      expect(path!.opacity).toBe(0.5)
    })

    it('includes timestamp in path', () => {
      const before = Date.now()

      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 0,
        y: 0
      })

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)
      const after = Date.now()

      expect(path!.timestamp).toBeGreaterThanOrEqual(before)
      expect(path!.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('cancel', () => {
    it('cancels current drawing', () => {
      controller.onPointerDown({ pointerId: 1, button: 0, pressure: 0.5 } as PointerEvent, {
        x: 0,
        y: 0
      })

      expect(controller.getIsDrawing()).toBe(true)

      controller.cancel()

      expect(controller.getIsDrawing()).toBe(false)

      const path = controller.onPointerUp({ pointerId: 1 } as PointerEvent)

      expect(path).toBeNull()
      expect(completedPaths).toHaveLength(0)
    })
  })
})

// ─── Path Drawing Tests ───────────────────────────────────────────────────────

describe('drawPath', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockContext()
  })

  it('draws path with correct style', () => {
    const path: DrawingPath = {
      id: 'test',
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 50, y: 50, pressure: 0.5 }
      ],
      strokeWidth: 3,
      strokeColor: '#ff0000',
      opacity: 0.7,
      timestamp: Date.now()
    }

    drawPath(ctx, path)

    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 50)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('uses smoothed points when available', () => {
    const path: DrawingPath = {
      id: 'test',
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 50, y: 50, pressure: 0.5 }
      ],
      smoothed: [
        { x: 0, y: 0 },
        { x: 25, y: 30 },
        { x: 50, y: 50 }
      ],
      strokeWidth: 2,
      strokeColor: '#000000',
      opacity: 1,
      timestamp: Date.now()
    }

    drawPath(ctx, path)

    expect(ctx.lineTo).toHaveBeenCalledWith(25, 30)
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 50)
  })

  it('does not draw paths with less than 2 points', () => {
    const path: DrawingPath = {
      id: 'test',
      points: [{ x: 0, y: 0, pressure: 0.5 }],
      strokeWidth: 2,
      strokeColor: '#000000',
      opacity: 1,
      timestamp: Date.now()
    }

    drawPath(ctx, path)

    expect(ctx.beginPath).not.toHaveBeenCalled()
  })
})

describe('drawPaths', () => {
  it('draws multiple paths', () => {
    const ctx = createMockContext()

    const paths: DrawingPath[] = [
      {
        id: '1',
        points: [
          { x: 0, y: 0, pressure: 0.5 },
          { x: 10, y: 10, pressure: 0.5 }
        ],
        strokeWidth: 2,
        strokeColor: '#000000',
        opacity: 1,
        timestamp: Date.now()
      },
      {
        id: '2',
        points: [
          { x: 20, y: 20, pressure: 0.5 },
          { x: 30, y: 30, pressure: 0.5 }
        ],
        strokeWidth: 2,
        strokeColor: '#ff0000',
        opacity: 1,
        timestamp: Date.now()
      }
    ]

    drawPaths(ctx, paths)

    expect(ctx.beginPath).toHaveBeenCalledTimes(2)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })
})
