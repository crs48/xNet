/**
 * Tests for layout engine
 */

import type { CanvasNode, CanvasEdge } from '../types'
import { describe, it, expect, beforeEach } from 'vitest'
import { LayoutEngine, createLayoutEngine } from '../layout/index'
import { createNode, createEdge } from '../store'

describe('LayoutEngine', () => {
  let engine: LayoutEngine

  beforeEach(() => {
    engine = createLayoutEngine()
  })

  describe('layoutGrid', () => {
    it('should layout nodes in a grid', () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const positions = engine.layoutGrid(nodes, { columns: 2, spacing: 20 })

      expect(positions.size).toBe(4)

      // First row
      const pos0 = positions.get(nodes[0].id)
      const pos1 = positions.get(nodes[1].id)
      expect(pos0?.x).toBe(50) // padding
      expect(pos0?.y).toBe(50) // padding
      expect(pos1?.x).toBe(170) // 50 + 100 + 20

      // Second row
      const pos2 = positions.get(nodes[2].id)
      expect(pos2?.y).toBe(120) // 50 + 50 + 20
    })

    it('should respect custom columns', () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const positions = engine.layoutGrid(nodes, { columns: 3 })

      // All should be on the same row
      const pos0 = positions.get(nodes[0].id)
      const pos1 = positions.get(nodes[1].id)
      const pos2 = positions.get(nodes[2].id)

      expect(pos0?.y).toBe(pos1?.y)
      expect(pos1?.y).toBe(pos2?.y)
    })
  })

  describe('layoutCircle', () => {
    it('should layout nodes in a circle', () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const positions = engine.layoutCircle(nodes, { radius: 200, center: { x: 0, y: 0 } })

      expect(positions.size).toBe(4)

      // Check that nodes are distributed around the center
      const allPositions = Array.from(positions.values())
      const avgX = allPositions.reduce((sum, p) => sum + p.x + p.width / 2, 0) / 4
      const avgY = allPositions.reduce((sum, p) => sum + p.y + p.height / 2, 0) / 4

      // Center should be approximately (0, 0)
      expect(avgX).toBeCloseTo(0, 0)
      expect(avgY).toBeCloseTo(0, 0)
    })

    it('should handle empty nodes array', () => {
      const positions = engine.layoutCircle([])
      expect(positions.size).toBe(0)
    })

    it('should position first node at top', () => {
      const nodes: CanvasNode[] = [createNode('card', { width: 100, height: 50 })]

      const positions = engine.layoutCircle(nodes, { radius: 200, center: { x: 0, y: 0 } })
      const pos = positions.get(nodes[0].id)

      // First node should be at top (negative Y relative to center)
      expect(pos!.y + pos!.height / 2).toBeLessThan(0)
    })
  })

  describe('layout (ELK)', () => {
    it('should layout nodes with edges', async () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const edges: CanvasEdge[] = [
        createEdge(nodes[0].id, nodes[1].id),
        createEdge(nodes[1].id, nodes[2].id)
      ]

      const result = await engine.layout(nodes, edges, { algorithm: 'layered' })

      expect(result.positions.size).toBe(3)
      expect(result.bounds).toBeDefined()
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should layout without edges', async () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const result = await engine.layout(nodes, [], { algorithm: 'box' })

      expect(result.positions.size).toBe(2)
    })

    it('should handle empty input', async () => {
      const result = await engine.layout([], [])

      expect(result.positions.size).toBe(0)
      expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    })

    it('should respect layout direction', async () => {
      const nodes: CanvasNode[] = [
        createNode('card', { width: 100, height: 50 }),
        createNode('card', { width: 100, height: 50 })
      ]

      const edges: CanvasEdge[] = [createEdge(nodes[0].id, nodes[1].id)]

      const rightResult = await engine.layout(nodes, edges, {
        algorithm: 'layered',
        direction: 'RIGHT'
      })
      const downResult = await engine.layout(nodes, edges, {
        algorithm: 'layered',
        direction: 'DOWN'
      })

      const rightPos0 = rightResult.positions.get(nodes[0].id)
      const rightPos1 = rightResult.positions.get(nodes[1].id)
      const downPos0 = downResult.positions.get(nodes[0].id)
      const downPos1 = downResult.positions.get(nodes[1].id)

      // RIGHT: second node should be to the right
      expect(rightPos1!.x).toBeGreaterThan(rightPos0!.x)

      // DOWN: second node should be below
      expect(downPos1!.y).toBeGreaterThan(downPos0!.y)
    })
  })

  describe('layoutSubset', () => {
    it('should only layout specified nodes', async () => {
      const nodes: CanvasNode[] = [
        createNode('card', { x: 0, y: 0, width: 100, height: 50 }),
        createNode('card', { x: 100, y: 100, width: 100, height: 50 }),
        createNode('card', { x: 200, y: 200, width: 100, height: 50 })
      ]

      const edges: CanvasEdge[] = [createEdge(nodes[0].id, nodes[1].id)]

      const subsetIds = new Set([nodes[0].id, nodes[1].id])
      const result = await engine.layoutSubset(nodes, subsetIds, edges)

      // Only subset nodes should have new positions
      expect(result.positions.size).toBe(2)
      expect(result.positions.has(nodes[0].id)).toBe(true)
      expect(result.positions.has(nodes[1].id)).toBe(true)
      expect(result.positions.has(nodes[2].id)).toBe(false)
    })
  })
})
