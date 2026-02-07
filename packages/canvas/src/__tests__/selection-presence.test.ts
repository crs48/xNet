/**
 * Selection Presence Tests
 *
 * Tests for selection lock manager, remote selections, and edit locking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SelectionLockManager,
  createSelectionLockManager,
  type AwarenessLike,
  type CanvasPresence
} from '../presence/index'

// ─── Mock Awareness ───────────────────────────────────────────────────────────

function createMockAwareness(clientId = 1): AwarenessLike & {
  states: Map<number, CanvasPresence>
  triggerChange: () => void
  setRemoteState: (id: number, state: CanvasPresence) => void
} {
  let localState: CanvasPresence | null = null
  const states = new Map<number, CanvasPresence>()
  const listeners: Array<() => void> = []

  return {
    clientID: clientId,
    states,
    getLocalState: () => localState,
    setLocalState: (state: CanvasPresence | null) => {
      localState = state
      if (state) {
        states.set(clientId, state)
      } else {
        states.delete(clientId)
      }
      // Trigger change after state update
      for (const listener of listeners) {
        listener()
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
    },
    setRemoteState: (id: number, state: CanvasPresence) => {
      states.set(id, state)
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

// ─── SelectionLockManager Tests ───────────────────────────────────────────────

describe('SelectionLockManager', () => {
  let awareness: ReturnType<typeof createMockAwareness>
  let manager: SelectionLockManager

  beforeEach(() => {
    awareness = createMockAwareness()
    manager = createSelectionLockManager(awareness)
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('lock acquisition', () => {
    it('acquires lock successfully', () => {
      const acquired = manager.tryAcquireLock('node-1')

      expect(acquired).toBe(true)
      expect(awareness.getLocalState()?.editingNodeId).toBe('node-1')
    })

    it('prevents lock when already locked by other', () => {
      // Simulate remote user holding lock
      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      const acquired = manager.tryAcquireLock('node-1')

      expect(acquired).toBe(false)
    })

    it('allows same user to re-acquire lock', () => {
      manager.tryAcquireLock('node-1')
      const reacquired = manager.tryAcquireLock('node-1')

      expect(reacquired).toBe(true)
    })

    it('allows locking different nodes by different users', () => {
      // Remote user locks node-1
      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      // Local user should be able to lock node-2
      const acquired = manager.tryAcquireLock('node-2')

      expect(acquired).toBe(true)
    })
  })

  describe('lock release', () => {
    it('releases lock correctly', () => {
      manager.tryAcquireLock('node-1')
      manager.releaseLock('node-1')

      expect(awareness.getLocalState()?.editingNodeId).toBeUndefined()
    })

    it('ignores release of non-held lock', () => {
      manager.tryAcquireLock('node-1')
      manager.releaseLock('node-2') // Different node

      expect(awareness.getLocalState()?.editingNodeId).toBe('node-1')
    })

    it('releases all locks', () => {
      manager.tryAcquireLock('node-1')
      manager.releaseAllLocks()

      expect(awareness.getLocalState()?.editingNodeId).toBeUndefined()
    })
  })

  describe('lock detection', () => {
    it('detects lock by other user', () => {
      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      const lock = manager.isLockedByOther('node-1')

      expect(lock).not.toBeNull()
      expect(lock?.ownerName).toBe('Bob')
      expect(lock?.ownerColor).toBe('#10b981')
    })

    it('returns null when node not locked', () => {
      const lock = manager.isLockedByOther('node-1')
      expect(lock).toBeNull()
    })

    it('returns null for own lock', () => {
      manager.tryAcquireLock('node-1')

      const lock = manager.isLockedByOther('node-1')
      expect(lock).toBeNull()
    })

    it('detects own lock with isLockedByMe', () => {
      manager.tryAcquireLock('node-1')

      expect(manager.isLockedByMe('node-1')).toBe(true)
      expect(manager.isLockedByMe('node-2')).toBe(false)
    })
  })

  describe('remote selections', () => {
    it('returns empty map when no remote users', () => {
      const selections = manager.getRemoteSelections()
      expect(selections.size).toBe(0)
    })

    it('returns remote selections', () => {
      awareness.setRemoteState(999, {
        selection: ['node-1', 'node-2'],
        user: { name: 'Bob', color: '#10b981' }
      })

      const selections = manager.getRemoteSelections()

      expect(selections.size).toBe(1)
      expect(selections.get(999)?.nodeIds).toEqual(['node-1', 'node-2'])
      expect(selections.get(999)?.user.name).toBe('Bob')
    })

    it('excludes selections without user info', () => {
      awareness.setRemoteState(999, {
        selection: ['node-1']
        // No user info
      })

      const selections = manager.getRemoteSelections()
      expect(selections.size).toBe(0)
    })

    it('excludes empty selections', () => {
      awareness.setRemoteState(999, {
        selection: [],
        user: { name: 'Bob', color: '#10b981' }
      })

      const selections = manager.getRemoteSelections()
      expect(selections.size).toBe(0)
    })
  })

  describe('lock change notifications', () => {
    it('notifies on lock changes', () => {
      const callback = vi.fn()
      manager.onLocksChange(callback)

      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      expect(callback).toHaveBeenCalled()
      const locks = callback.mock.calls[0][0] as Map<string, unknown>
      expect(locks.has('node-1')).toBe(true)
    })

    it('unsubscribe stops notifications', () => {
      const callback = vi.fn()
      const unsubscribe = manager.onLocksChange(callback)

      unsubscribe()

      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('getAllLocks', () => {
    it('returns all current locks', () => {
      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      const locks = manager.getAllLocks()

      expect(locks.size).toBe(1)
      expect(locks.get('node-1')?.ownerName).toBe('Bob')
    })

    it('includes local lock when user info is present', () => {
      // Set local user info first
      awareness.setLocalState({
        user: { name: 'Alice', color: '#3b82f6' }
      })

      manager.tryAcquireLock('node-1')

      const locks = manager.getAllLocks()
      expect(locks.size).toBe(1)
      expect(locks.get('node-1')?.ownerName).toBe('Alice')
    })
  })

  describe('cleanup', () => {
    it('stops updates after dispose', () => {
      const callback = vi.fn()
      manager.onLocksChange(callback)

      manager.dispose()

      awareness.setRemoteState(999, {
        editingNodeId: 'node-1',
        user: { name: 'Bob', color: '#10b981' }
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('ignores lock attempts after dispose', () => {
      manager.dispose()

      const acquired = manager.tryAcquireLock('node-1')

      expect(acquired).toBe(false)
    })
  })
})

// ─── Multiple Users Scenario Tests ────────────────────────────────────────────

describe('Multi-user Lock Scenarios', () => {
  it('prevents lock when remote user has it', () => {
    const awareness = createMockAwareness(1)
    const manager = createSelectionLockManager(awareness)

    // Simulate remote user (id=999) already has the lock
    awareness.setRemoteState(999, {
      editingNodeId: 'node-1',
      user: { name: 'Alice', color: '#3b82f6' }
    })

    // Local user should fail to acquire lock
    expect(manager.tryAcquireLock('node-1')).toBe(false)
    expect(manager.isLockedByOther('node-1')?.ownerName).toBe('Alice')

    manager.dispose()
  })

  it('allows lock after remote user releases', () => {
    const awareness = createMockAwareness(1)
    const manager = createSelectionLockManager(awareness)

    // Remote user has the lock
    awareness.setRemoteState(999, {
      editingNodeId: 'node-1',
      user: { name: 'Alice', color: '#3b82f6' }
    })

    // Can't acquire
    expect(manager.tryAcquireLock('node-1')).toBe(false)

    // Remote user releases (removes editingNodeId)
    awareness.setRemoteState(999, {
      user: { name: 'Alice', color: '#3b82f6' }
      // No editingNodeId
    })

    // Now local user can acquire
    expect(manager.tryAcquireLock('node-1')).toBe(true)
    expect(manager.isLockedByMe('node-1')).toBe(true)

    manager.dispose()
  })

  it('tracks multiple locks across users', () => {
    const awareness = createMockAwareness()
    const manager = createSelectionLockManager(awareness)

    // Multiple remote users editing different nodes
    awareness.setRemoteState(100, {
      editingNodeId: 'node-1',
      user: { name: 'Alice', color: '#3b82f6' }
    })

    awareness.setRemoteState(101, {
      editingNodeId: 'node-2',
      user: { name: 'Bob', color: '#10b981' }
    })

    awareness.setRemoteState(102, {
      editingNodeId: 'node-3',
      user: { name: 'Charlie', color: '#f59e0b' }
    })

    const locks = manager.getAllLocks()

    expect(locks.size).toBe(3)
    expect(locks.get('node-1')?.ownerName).toBe('Alice')
    expect(locks.get('node-2')?.ownerName).toBe('Bob')
    expect(locks.get('node-3')?.ownerName).toBe('Charlie')

    manager.dispose()
  })
})

// ─── Selection Indicator Behavior ─────────────────────────────────────────────

describe('Selection with Lock Integration', () => {
  it('tracks both selection and edit lock for same user', () => {
    const awareness = createMockAwareness()
    const manager = createSelectionLockManager(awareness)

    // Remote user selects and edits
    awareness.setRemoteState(999, {
      selection: ['node-1', 'node-2'],
      editingNodeId: 'node-1',
      user: { name: 'Bob', color: '#10b981' }
    })

    const selections = manager.getRemoteSelections()
    const locks = manager.getAllLocks()

    expect(selections.get(999)?.nodeIds).toEqual(['node-1', 'node-2'])
    expect(locks.get('node-1')?.ownerName).toBe('Bob')

    manager.dispose()
  })
})
