/**
 * Edge Routing Tests
 *
 * Tests for orthogonal edge routing with A* pathfinding.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { OrthogonalRouter, createOrthogonalRouter, MinHeap } from '../routing/index'

// ─── MinHeap Tests ────────────────────────────────────────────────────────────

describe('MinHeap', () => {
  it('returns items in sorted order', () => {
    const heap = new MinHeap<number>((a, b) => a - b)

    heap.push(5)
    heap.push(2)
    heap.push(8)
    heap.push(1)
    heap.push(9)

    expect(heap.pop()).toBe(1)
    expect(heap.pop()).toBe(2)
    expect(heap.pop()).toBe(5)
    expect(heap.pop()).toBe(8)
    expect(heap.pop()).toBe(9)
  })

  it('returns undefined when empty', () => {
    const heap = new MinHeap<number>((a, b) => a - b)

    expect(heap.pop()).toBeUndefined()
    expect(heap.isEmpty()).toBe(true)
  })

  it('supports custom comparator', () => {
    interface Item {
      priority: number
      value: string
    }

    const heap = new MinHeap<Item>((a, b) => a.priority - b.priority)

    heap.push({ priority: 3, value: 'c' })
    heap.push({ priority: 1, value: 'a' })
    heap.push({ priority: 2, value: 'b' })

    expect(heap.pop()?.value).toBe('a')
    expect(heap.pop()?.value).toBe('b')
    expect(heap.pop()?.value).toBe('c')
  })

  it('reports size correctly', () => {
    const heap = new MinHeap<number>((a, b) => a - b)

    expect(heap.size()).toBe(0)

    heap.push(1)
    expect(heap.size()).toBe(1)

    heap.push(2)
    expect(heap.size()).toBe(2)

    heap.pop()
    expect(heap.size()).toBe(1)
  })

  it('peeks without removing', () => {
    const heap = new MinHeap<number>((a, b) => a - b)

    heap.push(3)
    heap.push(1)
    heap.push(2)

    expect(heap.peek()).toBe(1)
    expect(heap.size()).toBe(3) // Size unchanged

    expect(heap.pop()).toBe(1)
    expect(heap.peek()).toBe(2)
  })

  it('clears all items', () => {
    const heap = new MinHeap<number>((a, b) => a - b)

    heap.push(1)
    heap.push(2)
    heap.push(3)

    heap.clear()

    expect(heap.isEmpty()).toBe(true)
    expect(heap.size()).toBe(0)
  })
})

// ─── OrthogonalRouter Tests ───────────────────────────────────────────────────

describe('OrthogonalRouter', () => {
  let router: OrthogonalRouter

  beforeEach(() => {
    router = new OrthogonalRouter({ gridSize: 10, nodeMargin: 10 })
  })

  describe('constructor', () => {
    it('creates router with default config', () => {
      const defaultRouter = new OrthogonalRouter()
      const config = defaultRouter.getConfig()

      expect(config.gridSize).toBe(10)
      expect(config.nodeMargin).toBe(20)
      expect(config.bendPenalty).toBe(50)
      expect(config.crossingPenalty).toBe(100)
    })

    it('creates router with custom config', () => {
      const customRouter = new OrthogonalRouter({
        gridSize: 20,
        bendPenalty: 100
      })
      const config = customRouter.getConfig()

      expect(config.gridSize).toBe(20)
      expect(config.bendPenalty).toBe(100)
      expect(config.nodeMargin).toBe(20) // Default
    })
  })

  describe('setConfig', () => {
    it('updates configuration', () => {
      router.setConfig({ gridSize: 15 })

      expect(router.getConfig().gridSize).toBe(15)
    })
  })

  describe('route', () => {
    it('routes direct horizontal connection', () => {
      router.setObstacles([])

      const path = router.route(
        { x: 0, y: 50, width: 50, height: 50 },
        'right',
        { x: 200, y: 50, width: 50, height: 50 },
        'left'
      )

      expect(path.length).toBeGreaterThanOrEqual(2)
      expect(path[0].x).toBeCloseTo(50, -1) // Right edge of source
      expect(path[path.length - 1].x).toBeCloseTo(200, -1) // Left edge of target
    })

    it('routes direct vertical connection', () => {
      router.setObstacles([])

      const path = router.route(
        { x: 50, y: 0, width: 50, height: 50 },
        'bottom',
        { x: 50, y: 200, width: 50, height: 50 },
        'top'
      )

      expect(path.length).toBeGreaterThanOrEqual(2)
      expect(path[0].y).toBeCloseTo(50, -1) // Bottom edge of source
      expect(path[path.length - 1].y).toBeCloseTo(200, -1) // Top edge of target
    })

    it('routes around obstacles', () => {
      router.setObstacles([{ position: { x: 100, y: 50, width: 50, height: 100 } }])

      const path = router.route(
        { x: 0, y: 75, width: 50, height: 50 },
        'right',
        { x: 200, y: 75, width: 50, height: 50 },
        'left'
      )

      // Path should go around the obstacle (more than 2 points)
      expect(path.length).toBeGreaterThan(2)

      // No point should be inside the obstacle (with margin)
      for (const point of path) {
        // Obstacle with margin is 90-160 x and 40-160 y
        const insideX = point.x >= 90 && point.x <= 160
        const insideY = point.y >= 40 && point.y <= 160
        const inside = insideX && insideY
        expect(inside).toBe(false)
      }
    })

    it('uses auto anchors', () => {
      router.setObstacles([])

      const path = router.route(
        { x: 0, y: 0, width: 50, height: 50 },
        'auto',
        { x: 200, y: 0, width: 50, height: 50 },
        'auto'
      )

      expect(path.length).toBeGreaterThan(0)
      // Auto should choose right for source, left for target
      expect(path[0].x).toBeCloseTo(50, -1) // Right edge of source
      expect(path[path.length - 1].x).toBeCloseTo(200, -1) // Left edge of target
    })

    it('handles diagonal routing', () => {
      router.setObstacles([])

      const path = router.route(
        { x: 0, y: 0, width: 50, height: 50 },
        'right',
        { x: 200, y: 200, width: 50, height: 50 },
        'left'
      )

      // Path should have at least 2 points
      expect(path.length).toBeGreaterThanOrEqual(2)

      // Path should use orthogonal segments between grid-snapped points
      // Skip first and last points (anchor points may not be on grid)
      for (let i = 2; i < path.length - 1; i++) {
        const prev = path[i - 1]
        const curr = path[i]

        // Either horizontal or vertical, not diagonal
        const isHorizontal = Math.abs(prev.y - curr.y) < 1
        const isVertical = Math.abs(prev.x - curr.x) < 1

        expect(isHorizontal || isVertical).toBe(true)
      }
    })
  })

  describe('path simplification', () => {
    it('simplifies collinear points', () => {
      router.setObstacles([])

      const path = router.route(
        { x: 0, y: 0, width: 50, height: 50 },
        'right',
        { x: 200, y: 100, width: 50, height: 50 },
        'left'
      )

      // Path should be simplified (no consecutive collinear points)
      for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1]
        const curr = path[i]
        const next = path[i + 1]

        const sameH = prev.y === curr.y && curr.y === next.y
        const sameV = prev.x === curr.x && curr.x === next.x

        expect(sameH || sameV).toBe(false)
      }
    })
  })

  describe('performance', () => {
    it('finds path within iteration limit', () => {
      router.setConfig({ maxIterations: 100 })

      // This should still find a path (or fallback)
      const path = router.route(
        { x: 0, y: 0, width: 50, height: 50 },
        'right',
        { x: 500, y: 500, width: 50, height: 50 },
        'left'
      )

      expect(path.length).toBeGreaterThanOrEqual(2)
    })

    it('falls back to straight line when no path found', () => {
      // Create a wall of obstacles
      router.setObstacles([{ position: { x: 75, y: 0, width: 50, height: 500 } }])

      // Set very low iteration limit
      router.setConfig({ maxIterations: 10 })

      const path = router.route(
        { x: 0, y: 50, width: 50, height: 50 },
        'right',
        { x: 200, y: 50, width: 50, height: 50 },
        'left'
      )

      // Should fallback to straight line (2 points)
      expect(path.length).toBe(2)
    })
  })
})

// ─── Factory Tests ────────────────────────────────────────────────────────────

describe('createOrthogonalRouter', () => {
  it('creates router instance', () => {
    const router = createOrthogonalRouter()
    expect(router).toBeInstanceOf(OrthogonalRouter)
  })

  it('passes config to router', () => {
    const router = createOrthogonalRouter({ gridSize: 25 })
    expect(router.getConfig().gridSize).toBe(25)
  })
})
