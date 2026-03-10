/**
 * Presence Tests
 *
 * Tests for canvas presence management (live cursors, activity states).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CanvasPresenceManager,
  createCanvasPresenceManager,
  getUserColor,
  USER_COLORS,
  type AwarenessLike,
  type CanvasPresence
} from '../presence/index'
import { Viewport } from '../spatial/index'

// ─── Mock Awareness ───────────────────────────────────────────────────────────

function createMockAwareness(): AwarenessLike & {
  states: Map<number, CanvasPresence>
  triggerChange: () => void
} {
  let localState: CanvasPresence | null = null
  const states = new Map<number, CanvasPresence>()
  const listeners: Array<() => void> = []

  return {
    clientID: 1,
    states,
    getLocalState: () => localState,
    setLocalState: (state: CanvasPresence | null) => {
      localState = state
      if (state) {
        states.set(1, state)
      } else {
        states.delete(1)
      }
    },
    getStates: () => states,
    on: (event: string, handler: () => void) => {
      if (event === 'change') {
        listeners.push(handler)
      }
    },
    off: (event: string, handler: () => void) => {
      if (event === 'change') {
        const idx = listeners.indexOf(handler)
        if (idx >= 0) listeners.splice(idx, 1)
      }
    },
    triggerChange: () => {
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── CanvasPresenceManager Tests ──────────────────────────────────────────────

describe('CanvasPresenceManager', () => {
  let awareness: ReturnType<typeof createMockAwareness>
  let manager: CanvasPresenceManager

  beforeEach(() => {
    awareness = createMockAwareness()
    manager = createCanvasPresenceManager(awareness, { name: 'Alice', color: '#3b82f6' })
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('initialization', () => {
    it('sets initial user state', () => {
      const state = awareness.getLocalState()
      expect(state).toMatchObject({
        user: { name: 'Alice', color: '#3b82f6' }
      })
    })

    it('works without initial user', () => {
      const mgr = createCanvasPresenceManager(awareness)
      expect(mgr.getLocalState()).toBeDefined()
      mgr.dispose()
    })

    it('preserves existing awareness state when constructed without a new user', async () => {
      awareness.setLocalState({
        user: { name: 'Existing', color: '#10b981' },
        selection: ['node-existing']
      })

      const mgr = createCanvasPresenceManager(awareness)
      mgr.updateCursor({ x: 80, y: 120 })
      await sleep(50)

      expect(awareness.getLocalState()).toMatchObject({
        user: { name: 'Existing', color: '#10b981' },
        selection: ['node-existing'],
        cursor: { x: 80, y: 120 }
      })

      mgr.dispose()
    })
  })

  describe('cursor updates', () => {
    it('updates cursor position', async () => {
      manager.updateCursor({ x: 100, y: 200 })

      // Wait for throttle
      await sleep(50)

      const state = awareness.getLocalState()
      expect(state?.cursor).toEqual({ x: 100, y: 200 })
    })

    it('clears cursor when null', async () => {
      manager.updateCursor({ x: 100, y: 200 })
      await sleep(50)

      manager.updateCursor(null)
      await sleep(50)

      const state = awareness.getLocalState()
      expect(state?.cursor).toBeUndefined()
    })

    it('throttles rapid cursor updates', async () => {
      const setStateSpy = vi.spyOn(awareness, 'setLocalState')
      const initialCalls = setStateSpy.mock.calls.length

      // Rapid updates
      for (let i = 0; i < 100; i++) {
        manager.updateCursor({ x: i, y: i })
      }

      await sleep(100)

      // Should have far fewer calls than updates
      const throttledCalls = setStateSpy.mock.calls.length - initialCalls
      expect(throttledCalls).toBeLessThan(10)
    })
  })

  describe('selection updates', () => {
    it('updates selection immediately', () => {
      manager.updateSelection(['node1', 'node2'])

      const state = awareness.getLocalState()
      expect(state?.selection).toEqual(['node1', 'node2'])
    })

    it('clears selection with empty array', () => {
      manager.updateSelection(['node1'])
      manager.updateSelection([])

      const state = awareness.getLocalState()
      expect(state?.selection).toEqual([])
    })
  })

  describe('activity updates', () => {
    it('updates activity state', async () => {
      manager.updateActivity('drawing')
      await sleep(50)

      const state = awareness.getLocalState()
      expect(state?.activity).toBe('drawing')
    })

    it('supports all activity types', async () => {
      const activities: CanvasPresence['activity'][] = [
        'idle',
        'panning',
        'dragging',
        'resizing',
        'drawing',
        'editing',
        'commenting',
        'peeking',
        'selecting'
      ]

      for (const activity of activities) {
        manager.updateActivity(activity)
        await sleep(50)
        expect(awareness.getLocalState()?.activity).toBe(activity)
      }
    })
  })

  describe('editing node updates', () => {
    it('tracks the object currently being edited', () => {
      manager.updateEditingNodeId('node-7')
      expect(awareness.getLocalState()?.editingNodeId).toBe('node-7')
    })

    it('clears the editing node when null is passed', () => {
      manager.updateEditingNodeId('node-7')
      manager.updateEditingNodeId(null)
      expect(awareness.getLocalState()?.editingNodeId).toBeUndefined()
    })
  })

  describe('viewport updates', () => {
    it('updates viewport state', async () => {
      manager.updateViewport({ x: 100, y: 50, zoom: 1.5 })
      await sleep(50)

      const state = awareness.getLocalState()
      expect(state?.viewport).toEqual({ x: 100, y: 50, zoom: 1.5 })
    })
  })

  describe('remote presence', () => {
    it('returns empty map when no remote users', () => {
      const remote = manager.getRemotePresence()
      expect(remote.size).toBe(0)
    })

    it('excludes local user from remote presence', () => {
      // Local user is clientID 1
      awareness.states.set(1, { user: { name: 'Alice', color: '#3b82f6' } })
      awareness.states.set(2, { user: { name: 'Bob', color: '#10b981' } })

      const remote = manager.getRemotePresence()
      expect(remote.size).toBe(1)
      expect(remote.get(2)?.user?.name).toBe('Bob')
    })

    it('returns all presence including local', () => {
      awareness.states.set(1, { user: { name: 'Alice', color: '#3b82f6' } })
      awareness.states.set(2, { user: { name: 'Bob', color: '#10b981' } })

      const all = manager.getAllPresence()
      expect(all.size).toBe(2)
    })
  })

  describe('presence change subscription', () => {
    it('notifies on presence changes', () => {
      const callback = vi.fn()
      manager.onPresenceChange(callback)

      // Add remote user
      awareness.states.set(2, {
        cursor: { x: 100, y: 100 },
        user: { name: 'Bob', color: '#10b981' }
      })
      awareness.triggerChange()

      expect(callback).toHaveBeenCalled()
    })

    it('unsubscribe stops notifications', () => {
      const callback = vi.fn()
      const unsubscribe = manager.onPresenceChange(callback)

      unsubscribe()

      awareness.states.set(2, { user: { name: 'Bob', color: '#10b981' } })
      awareness.triggerChange()

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('clears presence on clear()', () => {
      manager.updateCursor({ x: 100, y: 200 })
      manager.clear()

      expect(awareness.getLocalState()).toBeNull()
    })

    it('clears presence on dispose()', () => {
      manager.updateCursor({ x: 100, y: 200 })
      manager.dispose()

      expect(awareness.getLocalState()).toBeNull()
    })

    it('ignores updates after dispose', async () => {
      manager.dispose()
      manager.updateCursor({ x: 100, y: 200 })
      await sleep(50)

      expect(awareness.getLocalState()).toBeNull()
    })
  })

  describe('client ID', () => {
    it('returns the awareness client ID', () => {
      expect(manager.getClientId()).toBe(1)
    })
  })
})

// ─── User Color Utilities Tests ───────────────────────────────────────────────

describe('User Color Utilities', () => {
  describe('USER_COLORS', () => {
    it('has 10 colors', () => {
      expect(USER_COLORS).toHaveLength(10)
    })

    it('all colors are valid hex', () => {
      for (const color of USER_COLORS) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      }
    })
  })

  describe('getUserColor', () => {
    it('returns consistent color for same ID', () => {
      const color1 = getUserColor('user-123')
      const color2 = getUserColor('user-123')
      expect(color1).toBe(color2)
    })

    it('handles numeric IDs', () => {
      const color = getUserColor(12345)
      expect(USER_COLORS).toContain(color)
    })

    it('handles string IDs', () => {
      const color = getUserColor('some-user-id')
      expect(USER_COLORS).toContain(color)
    })

    it('distributes colors across users', () => {
      const colors = new Set<string>()
      for (let i = 0; i < 100; i++) {
        colors.add(getUserColor(`user-${i}`))
      }
      // Should use multiple colors
      expect(colors.size).toBeGreaterThan(1)
    })
  })
})

// ─── Coordinate Conversion Tests ──────────────────────────────────────────────

describe('Cursor Coordinate Conversion', () => {
  it('converts screen to canvas coordinates', () => {
    const viewport = new Viewport({ x: 100, y: 50, zoom: 1, width: 800, height: 600 })

    // Screen center should map to viewport center
    const canvasPos = viewport.screenToCanvas(400, 300)
    expect(canvasPos.x).toBe(100)
    expect(canvasPos.y).toBe(50)
  })

  it('converts canvas to screen coordinates', () => {
    const viewport = new Viewport({ x: 100, y: 50, zoom: 1, width: 800, height: 600 })

    // Viewport center should map to screen center
    const screenPos = viewport.canvasToScreen(100, 50)
    expect(screenPos.x).toBe(400)
    expect(screenPos.y).toBe(300)
  })

  it('handles zoom in coordinate conversion', () => {
    const viewport = new Viewport({ x: 0, y: 0, zoom: 2, width: 800, height: 600 })

    // At 2x zoom, 1 canvas unit = 2 screen pixels
    const screenPos = viewport.canvasToScreen(100, 50)
    expect(screenPos.x).toBe(400 + 100 * 2)
    expect(screenPos.y).toBe(300 + 50 * 2)
  })

  it('handles panned viewport', () => {
    const viewport = new Viewport({ x: 500, y: 300, zoom: 1, width: 800, height: 600 })

    // Canvas origin should be offset on screen
    const screenPos = viewport.canvasToScreen(0, 0)
    expect(screenPos.x).toBe(400 - 500)
    expect(screenPos.y).toBe(300 - 300)
  })
})

// ─── Stale Detection Tests ────────────────────────────────────────────────────

describe('Stale Cursor Detection', () => {
  it('calculates stale state from timestamp', () => {
    const staleThreshold = 5000
    const now = Date.now()

    // Recent cursor
    const recentCursor = { lastSeen: now - 1000 }
    expect(now - recentCursor.lastSeen > staleThreshold).toBe(false)

    // Stale cursor
    const staleCursor = { lastSeen: now - 6000 }
    expect(now - staleCursor.lastSeen > staleThreshold).toBe(true)
  })
})
