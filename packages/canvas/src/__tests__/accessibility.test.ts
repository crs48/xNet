/**
 * Accessibility Tests
 *
 * Tests for keyboard navigation and screen reader support.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  KeyboardNavigator,
  createKeyboardNavigator,
  Announcer,
  createAnnouncer,
  HIGH_CONTRAST_STYLES,
  isHighContrastEnabled,
  isReducedMotionPreferred,
  type NavigableNode,
  type NavigationSpatialIndex
} from '../accessibility/index'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createNode(id: string, x: number, y: number, width = 100, height = 50): NavigableNode {
  return { id, position: { x, y, width, height } }
}

function createMockSpatialIndex(nodes: NavigableNode[]): NavigationSpatialIndex {
  return {
    search: (bounds) => {
      return nodes
        .filter((n) => {
          const cx = n.position.x + n.position.width / 2
          const cy = n.position.y + n.position.height / 2
          return cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY
        })
        .map((n) => n.id)
    }
  }
}

// ─── KeyboardNavigator Tests ───────────────────────────────────────────────────

describe('KeyboardNavigator', () => {
  const nodes = [
    createNode('a', 0, 0),
    createNode('b', 200, 0),
    createNode('c', 0, 100),
    createNode('d', 200, 100)
  ]

  let onFocusChange: (nodeId: string | null) => void
  let onSelectionChange: (nodeIds: string[]) => void
  let onNodeActivate: (nodeId: string) => void

  beforeEach(() => {
    onFocusChange = vi.fn()
    onSelectionChange = vi.fn()
    onNodeActivate = vi.fn()
  })

  function createNavigator(focusedId: string | null = null) {
    return new KeyboardNavigator({
      nodes,
      selectedIds: new Set(),
      focusedId,
      spatialIndex: createMockSpatialIndex(nodes),
      onFocusChange,
      onSelectionChange,
      onNodeActivate
    })
  }

  describe('handleKeyDown', () => {
    it('moves focus right with ArrowRight', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })

      const handled = navigator.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(onFocusChange).toHaveBeenCalledWith('b')
    })

    it('moves focus down with ArrowDown', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('c')
    })

    it('moves focus left with ArrowLeft', () => {
      const navigator = createNavigator('b')
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('a')
    })

    it('moves focus up with ArrowUp', () => {
      const navigator = createNavigator('c')
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('a')
    })

    it('activates node on Enter', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'Enter' })

      const handled = navigator.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(onNodeActivate).toHaveBeenCalledWith('a')
    })

    it('activates node on Space', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: ' ' })

      navigator.handleKeyDown(event)

      expect(onNodeActivate).toHaveBeenCalledWith('a')
    })

    it('clears selection on Escape', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'Escape' })

      const handled = navigator.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(onFocusChange).toHaveBeenCalledWith(null)
      expect(onSelectionChange).toHaveBeenCalledWith([])
    })

    it('selects all on Ctrl+A', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })

      const handled = navigator.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(onSelectionChange).toHaveBeenCalledWith(['a', 'b', 'c', 'd'])
    })

    it('focuses first node on Home', () => {
      const navigator = createNavigator('c')
      const event = new KeyboardEvent('keydown', { key: 'Home' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('a')
    })

    it('focuses last node on End', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'End' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('d')
    })

    it('focuses first node when no focus and arrow pressed', () => {
      const navigator = createNavigator(null)
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })

      navigator.handleKeyDown(event)

      expect(onFocusChange).toHaveBeenCalledWith('a')
    })

    it('returns false for unhandled keys', () => {
      const navigator = createNavigator('a')
      const event = new KeyboardEvent('keydown', { key: 'x' })

      const handled = navigator.handleKeyDown(event)

      expect(handled).toBe(false)
    })
  })

  describe('updateOptions', () => {
    it('updates options', () => {
      const navigator = createNavigator('a')
      const newOnActivate = vi.fn()

      navigator.updateOptions({ onNodeActivate: newOnActivate })
      navigator.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))

      expect(newOnActivate).toHaveBeenCalledWith('a')
    })
  })
})

describe('createKeyboardNavigator', () => {
  it('creates navigator with factory', () => {
    const navigator = createKeyboardNavigator({
      nodes: [],
      selectedIds: new Set(),
      focusedId: null,
      spatialIndex: { search: () => [] },
      onFocusChange: vi.fn(),
      onSelectionChange: vi.fn(),
      onNodeActivate: vi.fn()
    })

    expect(navigator).toBeInstanceOf(KeyboardNavigator)
  })
})

// ─── Announcer Tests ───────────────────────────────────────────────────────────

describe('Announcer', () => {
  describe('constructor', () => {
    it('creates announcer', () => {
      const announcer = new Announcer()
      expect(announcer).toBeDefined()
      announcer.destroy()
    })
  })

  describe('announce', () => {
    it('announces message without error', () => {
      const announcer = new Announcer()
      expect(() => announcer.announce('Test message')).not.toThrow()
      announcer.destroy()
    })
  })

  describe('announceNodeFocus', () => {
    it('announces node focus', () => {
      const announcer = new Announcer()
      expect(() => {
        announcer.announceNodeFocus({ type: 'page', properties: { title: 'My Page' } })
      }).not.toThrow()
      announcer.destroy()
    })
  })

  describe('announceSelection', () => {
    it('announces selection cleared', () => {
      const announcer = new Announcer()
      expect(() => announcer.announceSelection(0)).not.toThrow()
      announcer.destroy()
    })

    it('announces single selection', () => {
      const announcer = new Announcer()
      expect(() => announcer.announceSelection(1)).not.toThrow()
      announcer.destroy()
    })

    it('announces multiple selection', () => {
      const announcer = new Announcer()
      expect(() => announcer.announceSelection(5)).not.toThrow()
      announcer.destroy()
    })
  })

  describe('announceZoom', () => {
    it('announces zoom level', () => {
      const announcer = new Announcer()
      expect(() => announcer.announceZoom(150)).not.toThrow()
      announcer.destroy()
    })
  })

  describe('destroy', () => {
    it('cleans up without error', () => {
      const announcer = new Announcer()
      expect(() => announcer.destroy()).not.toThrow()
    })

    it('can be called multiple times', () => {
      const announcer = new Announcer()
      announcer.destroy()
      expect(() => announcer.destroy()).not.toThrow()
    })
  })
})

describe('createAnnouncer', () => {
  it('creates announcer with factory', () => {
    const announcer = createAnnouncer()
    expect(announcer).toBeInstanceOf(Announcer)
    announcer.destroy()
  })
})

// ─── High Contrast Tests ───────────────────────────────────────────────────────

describe('HIGH_CONTRAST_STYLES', () => {
  it('has expected structure', () => {
    expect(HIGH_CONTRAST_STYLES).toHaveProperty('node')
    expect(HIGH_CONTRAST_STYLES).toHaveProperty('edge')
    expect(HIGH_CONTRAST_STYLES).toHaveProperty('selection')
    expect(HIGH_CONTRAST_STYLES).toHaveProperty('focus')
  })

  it('has correct node styles', () => {
    expect(HIGH_CONTRAST_STYLES.node.border).toContain('solid black')
    expect(HIGH_CONTRAST_STYLES.node.backgroundColor).toBe('white')
  })

  it('has correct edge styles', () => {
    expect(HIGH_CONTRAST_STYLES.edge.stroke).toBe('black')
    expect(HIGH_CONTRAST_STYLES.edge.strokeWidth).toBeGreaterThan(0)
  })
})

describe('isHighContrastEnabled', () => {
  it('returns boolean', () => {
    const result = isHighContrastEnabled()
    expect(typeof result).toBe('boolean')
  })
})

describe('isReducedMotionPreferred', () => {
  it('returns boolean', () => {
    const result = isReducedMotionPreferred()
    expect(typeof result).toBe('boolean')
  })
})
