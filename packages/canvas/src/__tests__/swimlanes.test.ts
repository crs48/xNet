/**
 * Swimlane Tests
 *
 * Tests for swimlane manager and related functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SwimlaneManager,
  createSwimlaneManager,
  DEFAULT_SWIMLANE_CONFIG,
  getContentBounds,
  type SwimlaneNode,
  type GenericCanvasNode
} from '../swimlane/index'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createSwimlane(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<SwimlaneNode['properties']> = {}
): SwimlaneNode {
  return {
    id,
    type: 'swimlane',
    position: { x, y, width, height },
    properties: {
      title: options.title ?? `Swimlane ${id}`,
      orientation: options.orientation ?? 'horizontal',
      color: options.color ?? '#3b82f6',
      headerSize: options.headerSize ?? 40,
      childNodeIds: options.childNodeIds ?? [],
      collapsed: options.collapsed ?? false
    }
  }
}

function createNode(
  id: string,
  x: number,
  y: number,
  width: number = 100,
  height: number = 50
): GenericCanvasNode {
  return {
    id,
    type: 'document',
    position: { x, y, width, height }
  }
}

// ─── SwimlaneManager Tests ─────────────────────────────────────────────────────

describe('SwimlaneManager', () => {
  let manager: SwimlaneManager

  beforeEach(() => {
    manager = new SwimlaneManager()
  })

  describe('constructor', () => {
    it('creates manager with default config', () => {
      const config = manager.getConfig()
      expect(config.autoResizePadding).toBe(DEFAULT_SWIMLANE_CONFIG.autoResizePadding)
      expect(config.minWidth).toBe(DEFAULT_SWIMLANE_CONFIG.minWidth)
      expect(config.minHeight).toBe(DEFAULT_SWIMLANE_CONFIG.minHeight)
    })

    it('creates manager with custom config', () => {
      const m = new SwimlaneManager({ autoResizePadding: 30 })
      expect(m.getConfig().autoResizePadding).toBe(30)
    })
  })

  describe('getConfig / setConfig', () => {
    it('returns a copy of config', () => {
      const config1 = manager.getConfig()
      const config2 = manager.getConfig()
      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2)
    })

    it('updates config', () => {
      manager.setConfig({ minWidth: 300 })
      expect(manager.getConfig().minWidth).toBe(300)
      expect(manager.getConfig().minHeight).toBe(DEFAULT_SWIMLANE_CONFIG.minHeight)
    })
  })

  describe('isInsideSwimlane', () => {
    it('detects position inside horizontal swimlane content area', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400)

      // Inside content area (below header)
      expect(manager.isInsideSwimlane({ x: 150, y: 200 }, lane)).toBe(true)
    })

    it('detects position in header area (not content)', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400)

      // In header area (y < headerSize)
      expect(manager.isInsideSwimlane({ x: 150, y: 20 }, lane)).toBe(false)
    })

    it('detects position outside swimlane', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400)

      expect(manager.isInsideSwimlane({ x: 400, y: 200 }, lane)).toBe(false)
      expect(manager.isInsideSwimlane({ x: -50, y: 200 }, lane)).toBe(false)
    })

    it('returns false for collapsed swimlane', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400, { collapsed: true })

      expect(manager.isInsideSwimlane({ x: 150, y: 200 }, lane)).toBe(false)
    })

    it('handles vertical orientation', () => {
      const lane = createSwimlane('lane1', 0, 0, 400, 300, { orientation: 'vertical' })

      // Inside content area (right of header)
      expect(manager.isInsideSwimlane({ x: 200, y: 150 }, lane)).toBe(true)

      // In header area (x < headerSize)
      expect(manager.isInsideSwimlane({ x: 20, y: 150 }, lane)).toBe(false)
    })
  })

  describe('getSwimlaneAtPosition', () => {
    it('finds containing swimlane', () => {
      const lanes = [
        createSwimlane('lane1', 0, 0, 300, 400),
        createSwimlane('lane2', 350, 0, 300, 400)
      ]

      const result = manager.getSwimlaneAtPosition({ x: 150, y: 200 }, lanes)
      expect(result?.id).toBe('lane1')
    })

    it('returns null when position is outside all swimlanes', () => {
      const lanes = [createSwimlane('lane1', 0, 0, 300, 400)]

      const result = manager.getSwimlaneAtPosition({ x: 500, y: 200 }, lanes)
      expect(result).toBeNull()
    })

    it('returns topmost swimlane when overlapping', () => {
      // Later in array = higher z-index
      const lanes = [
        createSwimlane('lane1', 0, 0, 300, 400),
        createSwimlane('lane2', 100, 50, 300, 400) // Overlaps lane1
      ]

      const result = manager.getSwimlaneAtPosition({ x: 200, y: 200 }, lanes)
      expect(result?.id).toBe('lane2')
    })
  })

  describe('getSwimlaneForNode', () => {
    it('finds swimlane containing node center', () => {
      const lanes = [createSwimlane('lane1', 0, 0, 300, 400)]
      const node = createNode('n1', 100, 150, 100, 50)

      const result = manager.getSwimlaneForNode(node, lanes)
      expect(result?.id).toBe('lane1')
    })

    it('returns null when node is outside all swimlanes', () => {
      const lanes = [createSwimlane('lane1', 0, 0, 300, 400)]
      const node = createNode('n1', 500, 150, 100, 50)

      const result = manager.getSwimlaneForNode(node, lanes)
      expect(result).toBeNull()
    })
  })

  describe('addNodeToSwimlane', () => {
    it('adds node to swimlane', () => {
      const lanes = new Map<string, SwimlaneNode>([
        ['lane1', createSwimlane('lane1', 0, 0, 300, 400)]
      ])

      const updated = manager.addNodeToSwimlane('node1', 'lane1', lanes)

      expect(updated.get('lane1')!.properties.childNodeIds).toContain('node1')
    })

    it('moves node between swimlanes', () => {
      const lanes = new Map<string, SwimlaneNode>([
        ['lane1', createSwimlane('lane1', 0, 0, 300, 400, { childNodeIds: ['node1'] })],
        ['lane2', createSwimlane('lane2', 350, 0, 300, 400)]
      ])

      const updated = manager.addNodeToSwimlane('node1', 'lane2', lanes)

      expect(updated.get('lane1')!.properties.childNodeIds).not.toContain('node1')
      expect(updated.get('lane2')!.properties.childNodeIds).toContain('node1')
    })

    it('does not duplicate node if already in target swimlane', () => {
      const lanes = new Map<string, SwimlaneNode>([
        ['lane1', createSwimlane('lane1', 0, 0, 300, 400, { childNodeIds: ['node1'] })]
      ])

      const updated = manager.addNodeToSwimlane('node1', 'lane1', lanes)

      expect(updated.get('lane1')!.properties.childNodeIds).toEqual(['node1'])
    })
  })

  describe('removeNodeFromSwimlane', () => {
    it('removes node from swimlane', () => {
      const lanes = new Map<string, SwimlaneNode>([
        ['lane1', createSwimlane('lane1', 0, 0, 300, 400, { childNodeIds: ['node1', 'node2'] })]
      ])

      const updated = manager.removeNodeFromSwimlane('node1', lanes)

      expect(updated.get('lane1')!.properties.childNodeIds).toEqual(['node2'])
    })

    it('handles node not in any swimlane', () => {
      const lanes = new Map<string, SwimlaneNode>([
        ['lane1', createSwimlane('lane1', 0, 0, 300, 400)]
      ])

      const updated = manager.removeNodeFromSwimlane('node1', lanes)

      expect(updated.get('lane1')!.properties.childNodeIds).toEqual([])
    })
  })

  describe('findSwimlaneContaining', () => {
    it('finds swimlane containing node ID', () => {
      const lanes = [
        createSwimlane('lane1', 0, 0, 300, 400, { childNodeIds: ['node1'] }),
        createSwimlane('lane2', 350, 0, 300, 400, { childNodeIds: ['node2'] })
      ]

      expect(manager.findSwimlaneContaining('node1', lanes)?.id).toBe('lane1')
      expect(manager.findSwimlaneContaining('node2', lanes)?.id).toBe('lane2')
      expect(manager.findSwimlaneContaining('node3', lanes)).toBeNull()
    })
  })

  describe('resizeToFitChildren', () => {
    it('expands horizontal swimlane to fit children', () => {
      const lane = createSwimlane('lane1', 0, 0, 200, 200)
      const children = [
        createNode('n1', 50, 100, 100, 50),
        createNode('n2', 50, 200, 100, 50) // Outside current bounds
      ]

      const resize = manager.resizeToFitChildren(lane, children, 20)

      expect(resize.height).toBeGreaterThan(200)
    })

    it('returns empty object when no children', () => {
      const lane = createSwimlane('lane1', 0, 0, 200, 200)

      const resize = manager.resizeToFitChildren(lane, [])

      expect(resize).toEqual({})
    })

    it('respects minimum dimensions', () => {
      const lane = createSwimlane('lane1', 0, 0, 100, 100)
      const children = [createNode('n1', 10, 50, 20, 10)]

      const resize = manager.resizeToFitChildren(lane, children, 5)

      // Should not go below minWidth/minHeight
      if (resize.width !== undefined) {
        expect(resize.width).toBeGreaterThanOrEqual(DEFAULT_SWIMLANE_CONFIG.minWidth)
      }
      if (resize.height !== undefined) {
        expect(resize.height).toBeGreaterThanOrEqual(DEFAULT_SWIMLANE_CONFIG.minHeight)
      }
    })

    it('handles vertical orientation', () => {
      const lane = createSwimlane('lane1', 0, 0, 200, 200, { orientation: 'vertical' })
      const children = [
        createNode('n1', 100, 50, 100, 50),
        createNode('n2', 250, 50, 100, 50) // Outside current bounds
      ]

      const resize = manager.resizeToFitChildren(lane, children, 20)

      expect(resize.width).toBeGreaterThan(200)
    })
  })

  describe('getEffectiveHeight', () => {
    it('returns full height when not collapsed', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400)
      expect(manager.getEffectiveHeight(lane)).toBe(400)
    })

    it('returns header height when collapsed horizontal', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400, {
        collapsed: true,
        headerSize: 40
      })
      expect(manager.getEffectiveHeight(lane)).toBe(40)
    })

    it('returns full height when collapsed vertical', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400, {
        orientation: 'vertical',
        collapsed: true
      })
      expect(manager.getEffectiveHeight(lane)).toBe(400)
    })
  })

  describe('getEffectiveWidth', () => {
    it('returns full width when not collapsed', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400)
      expect(manager.getEffectiveWidth(lane)).toBe(300)
    })

    it('returns header width when collapsed vertical', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400, {
        orientation: 'vertical',
        collapsed: true,
        headerSize: 40
      })
      expect(manager.getEffectiveWidth(lane)).toBe(40)
    })

    it('returns full width when collapsed horizontal', () => {
      const lane = createSwimlane('lane1', 0, 0, 300, 400, {
        orientation: 'horizontal',
        collapsed: true
      })
      expect(manager.getEffectiveWidth(lane)).toBe(300)
    })
  })
})

describe('getContentBounds', () => {
  it('calculates horizontal swimlane content bounds', () => {
    const lane = createSwimlane('lane1', 100, 50, 300, 400, { headerSize: 40 })
    const bounds = getContentBounds(lane)

    expect(bounds).toEqual({
      x: 100,
      y: 90, // 50 + 40
      width: 300,
      height: 360 // 400 - 40
    })
  })

  it('calculates vertical swimlane content bounds', () => {
    const lane = createSwimlane('lane1', 100, 50, 400, 300, {
      orientation: 'vertical',
      headerSize: 40
    })
    const bounds = getContentBounds(lane)

    expect(bounds).toEqual({
      x: 140, // 100 + 40
      y: 50,
      width: 360, // 400 - 40
      height: 300
    })
  })

  it('returns zero-size bounds when collapsed', () => {
    const lane = createSwimlane('lane1', 100, 50, 300, 400, { collapsed: true })
    const bounds = getContentBounds(lane)

    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
  })
})

describe('createSwimlaneManager', () => {
  it('creates manager with factory function', () => {
    const manager = createSwimlaneManager()
    expect(manager).toBeInstanceOf(SwimlaneManager)
  })

  it('passes config to manager', () => {
    const manager = createSwimlaneManager({ autoResizePadding: 50 })
    expect(manager.getConfig().autoResizePadding).toBe(50)
  })
})

describe('DEFAULT_SWIMLANE_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_SWIMLANE_CONFIG.autoResizePadding).toBe(20)
    expect(DEFAULT_SWIMLANE_CONFIG.minWidth).toBe(200)
    expect(DEFAULT_SWIMLANE_CONFIG.minHeight).toBe(150)
    expect(DEFAULT_SWIMLANE_CONFIG.defaultHeaderSize).toBe(40)
  })
})
