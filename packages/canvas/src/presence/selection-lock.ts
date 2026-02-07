/**
 * Selection Lock Manager
 *
 * Manages edit locks for collaborative editing, preventing concurrent
 * edits to the same node by different users.
 */

import type { AwarenessLike, CanvasPresence } from './canvas-presence'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelectionLock {
  nodeId: string
  ownerId: number // Awareness clientID
  ownerName: string
  ownerColor: string
  acquiredAt: number
}

// ─── Selection Lock Manager ──────────────────────────────────────────────────

export class SelectionLockManager {
  private awareness: AwarenessLike
  private locks = new Map<string, SelectionLock>()
  private listeners = new Set<(locks: Map<string, SelectionLock>) => void>()
  private disposed = false

  constructor(awareness: AwarenessLike) {
    this.awareness = awareness

    // Listen for remote lock changes
    awareness.on('change', this.handleAwarenessChange)

    // Initial sync
    this.updateLocksFromAwareness()
  }

  private handleAwarenessChange = (): void => {
    if (this.disposed) return
    this.updateLocksFromAwareness()
  }

  /**
   * Try to acquire an edit lock on a node.
   * Returns true if lock acquired, false if already locked by someone else.
   */
  tryAcquireLock(nodeId: string): boolean {
    if (this.disposed) return false

    const existingLock = this.locks.get(nodeId)

    // Already locked by someone else?
    if (existingLock && existingLock.ownerId !== this.awareness.clientID) {
      return false
    }

    // Acquire lock
    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}
    this.awareness.setLocalState({
      ...current,
      editingNodeId: nodeId
    })

    return true
  }

  /**
   * Release the lock on a node.
   */
  releaseLock(nodeId: string): void {
    if (this.disposed) return

    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}

    if (current.editingNodeId === nodeId) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { editingNodeId, ...rest } = current
      this.awareness.setLocalState(rest)
    }
  }

  /**
   * Release all locks held by this client.
   */
  releaseAllLocks(): void {
    if (this.disposed) return

    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}

    if (current.editingNodeId) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { editingNodeId, ...rest } = current
      this.awareness.setLocalState(rest)
    }
  }

  /**
   * Check if a node is locked by someone else.
   */
  isLockedByOther(nodeId: string): SelectionLock | null {
    const lock = this.locks.get(nodeId)
    if (lock && lock.ownerId !== this.awareness.clientID) {
      return lock
    }
    return null
  }

  /**
   * Check if a node is locked by this client.
   */
  isLockedByMe(nodeId: string): boolean {
    // First check local state directly (most reliable for own locks)
    const localState = this.awareness.getLocalState() as CanvasPresence | null
    if (localState?.editingNodeId === nodeId) {
      return true
    }
    // Fall back to locks map
    const lock = this.locks.get(nodeId)
    return lock !== undefined && lock.ownerId === this.awareness.clientID
  }

  /**
   * Get all current locks.
   */
  getAllLocks(): Map<string, SelectionLock> {
    return new Map(this.locks)
  }

  /**
   * Get remote selections (nodes selected by others).
   */
  getRemoteSelections(): Map<number, { nodeIds: string[]; user: { name: string; color: string } }> {
    const selections = new Map<
      number,
      { nodeIds: string[]; user: { name: string; color: string } }
    >()

    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.awareness.clientID) return

      const presence = state as CanvasPresence
      if (presence.selection?.length && presence.user) {
        selections.set(clientId, {
          nodeIds: presence.selection,
          user: presence.user
        })
      }
    })

    return selections
  }

  /**
   * Subscribe to lock changes.
   */
  onLocksChange(callback: (locks: Map<string, SelectionLock>) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.disposed = true
    this.awareness.off('change', this.handleAwarenessChange)
    this.listeners.clear()
  }

  private updateLocksFromAwareness(): void {
    const newLocks = new Map<string, SelectionLock>()

    this.awareness.getStates().forEach((state, clientId) => {
      const presence = state as CanvasPresence

      if (presence.editingNodeId && presence.user) {
        newLocks.set(presence.editingNodeId, {
          nodeId: presence.editingNodeId,
          ownerId: clientId,
          ownerName: presence.user.name,
          ownerColor: presence.user.color,
          acquiredAt: Date.now()
        })
      }
    })

    this.locks = newLocks

    // Notify listeners
    this.listeners.forEach((cb) => cb(newLocks))
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

export function createSelectionLockManager(awareness: AwarenessLike): SelectionLockManager {
  return new SelectionLockManager(awareness)
}
