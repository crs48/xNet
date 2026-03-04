/**
 * UndoManager - Per-node undo/redo via compensating changes
 *
 * Undo creates a new compensating change that restores previous values.
 * This is P2P-safe — peers see the undo as a normal change.
 */

import type { UndoEntry, UndoManagerOptions } from './types'
import type { DID } from '@xnetjs/core'
import type { NodeChange, NodeState, NodeId, TransactionOperation, NodeStore } from '@xnetjs/data'

/**
 * Duck-typed telemetry interface to avoid circular dependencies.
 */
export interface TelemetryReporter {
  reportPerformance(metricName: string, durationMs: number): void
  reportUsage(metricName: string, count: number): void
}

export class UndoManager {
  private undoStacks = new Map<NodeId, UndoEntry[]>()
  private redoStacks = new Map<NodeId, UndoEntry[]>()
  private options: Required<UndoManagerOptions>
  private unsubscribe: (() => void) | null = null
  private lastEntryTime = new Map<NodeId, number>()
  private localDID: DID
  private _isUndoRedoing = false
  /** Cache of node state before each change, for capturing previousValues */
  private preChangeState = new Map<NodeId, Record<string, unknown>>()
  private telemetry?: TelemetryReporter

  constructor(
    private store: NodeStore,
    localDID: DID,
    options?: Partial<UndoManagerOptions>,
    telemetry?: TelemetryReporter
  ) {
    this.localDID = localDID
    this.telemetry = telemetry
    this.options = {
      maxStackSize: options?.maxStackSize ?? 100,
      localOnly: options?.localOnly ?? true,
      mergeInterval: options?.mergeInterval ?? 300
    }
  }

  /** Start tracking changes for undo */
  start(): void {
    this.unsubscribe = this.store.subscribe((event) => {
      if (!event.node) return
      if (event.isRemote && this.options.localOnly) return
      if (this.options.localOnly && event.change.authorDID !== this.localDID) return
      if (this._isUndoRedoing) return

      this.trackChange(event.change, event.node)
    })
  }

  /** Stop tracking */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Capture pre-change state for a node (call before applying a change) */
  capturePreChangeState(nodeId: NodeId, properties: Record<string, unknown>): void {
    this.preChangeState.set(nodeId, { ...properties })
  }

  /** Undo the last change for a node */
  async undo(nodeId: NodeId): Promise<boolean> {
    const stack = this.undoStacks.get(nodeId)
    if (!stack?.length) return false

    const entry = stack.pop()!
    const start = this.telemetry ? Date.now() : 0

    this._isUndoRedoing = true
    try {
      if (entry.wasDelete) {
        // Undo a delete → restore the node
        await this.store.restore(nodeId)
      } else if (entry.wasRestore) {
        // Undo a restore → delete the node again
        await this.store.delete(nodeId)
      } else {
        await this.store.update(nodeId, { properties: entry.previousValues })
      }
    } finally {
      this._isUndoRedoing = false
    }

    this.telemetry?.reportPerformance('history.undo', Date.now() - start)
    this.telemetry?.reportUsage('history.undo', 1)

    const redoStack = this.getOrCreateStack(this.redoStacks, nodeId)
    redoStack.push(entry)

    return true
  }

  /** Redo the last undone change for a node */
  async redo(nodeId: NodeId): Promise<boolean> {
    const stack = this.redoStacks.get(nodeId)
    if (!stack?.length) return false

    const entry = stack.pop()!
    const start = this.telemetry ? Date.now() : 0

    this._isUndoRedoing = true
    try {
      if (entry.wasDelete) {
        // Redo a delete → delete the node again
        await this.store.delete(nodeId)
      } else if (entry.wasRestore) {
        // Redo a restore → restore the node again
        await this.store.restore(nodeId)
      } else {
        await this.store.update(nodeId, { properties: entry.currentValues })
      }
    } finally {
      this._isUndoRedoing = false
    }

    this.telemetry?.reportPerformance('history.redo', Date.now() - start)
    this.telemetry?.reportUsage('history.redo', 1)

    const undoStack = this.getOrCreateStack(this.undoStacks, nodeId)
    undoStack.push(entry)

    return true
  }

  /** Undo all changes in a batch/transaction */
  async undoBatch(batchId: string): Promise<boolean> {
    // Find all entries with this batchId across all nodes
    const entries: { nodeId: NodeId; entry: UndoEntry; stackIndex: number }[] = []

    for (const [nodeId, stack] of this.undoStacks) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].batchId === batchId) {
          entries.push({ nodeId, entry: stack[i], stackIndex: i })
        }
      }
    }

    if (entries.length === 0) return false

    // Remove from undo stacks
    for (const { nodeId, stackIndex } of entries) {
      const stack = this.undoStacks.get(nodeId)!
      stack.splice(stackIndex, 1)
    }

    // Build transaction operations
    const operations: TransactionOperation[] = entries.map(({ nodeId, entry }) => ({
      type: 'update' as const,
      nodeId,
      options: { properties: entry.previousValues }
    }))

    // Apply all reverts as a single transaction
    this._isUndoRedoing = true
    try {
      await this.store.transaction(operations)
    } finally {
      this._isUndoRedoing = false
    }

    // Push to redo stacks
    for (const { nodeId, entry } of entries) {
      const redoStack = this.getOrCreateStack(this.redoStacks, nodeId)
      redoStack.push(entry)
    }

    return true
  }

  /** Check if undo is available */
  canUndo(nodeId: NodeId): boolean {
    return (this.undoStacks.get(nodeId)?.length ?? 0) > 0
  }

  /** Check if redo is available */
  canRedo(nodeId: NodeId): boolean {
    return (this.redoStacks.get(nodeId)?.length ?? 0) > 0
  }

  /** Get undo stack size */
  getUndoCount(nodeId: NodeId): number {
    return this.undoStacks.get(nodeId)?.length ?? 0
  }

  /** Get redo stack size */
  getRedoCount(nodeId: NodeId): number {
    return this.redoStacks.get(nodeId)?.length ?? 0
  }

  /** Clear all stacks for a node */
  clear(nodeId: NodeId): void {
    this.undoStacks.delete(nodeId)
    this.redoStacks.delete(nodeId)
    this.preChangeState.delete(nodeId)
  }

  /** Clear all stacks */
  clearAll(): void {
    this.undoStacks.clear()
    this.redoStacks.clear()
    this.preChangeState.clear()
  }

  // ─── Private ─────────────────────────────────────────────────

  private trackChange(change: NodeChange, _nodeState: NodeState): void {
    const nodeId = change.payload.nodeId
    const now = Date.now()
    const lastTime = this.lastEntryTime.get(nodeId) ?? 0

    // Compute previous values from pre-change cache or current state
    const previousValues: Record<string, unknown> = {}
    const currentValues: Record<string, unknown> = {}
    const cached = this.preChangeState.get(nodeId)

    for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
      currentValues[key] = value
      // Use cached pre-change state if available
      previousValues[key] = cached?.[key]
    }

    this.preChangeState.delete(nodeId)

    const entry: UndoEntry = {
      changeHash: change.hash,
      nodeId,
      previousValues,
      currentValues,
      batchId: change.batchId,
      wallTime: change.wallTime,
      wasDelete: change.payload.deleted === true,
      wasRestore: change.payload.deleted === false
    }

    // Merge with previous entry if within merge interval
    const stack = this.getOrCreateStack(this.undoStacks, nodeId)
    if (stack.length > 0 && now - lastTime < this.options.mergeInterval) {
      const prev = stack[stack.length - 1]
      for (const [key, value] of Object.entries(currentValues)) {
        if (!(key in prev.previousValues)) {
          prev.previousValues[key] = previousValues[key]
        }
        prev.currentValues[key] = value
      }
    } else {
      stack.push(entry)
      if (stack.length > this.options.maxStackSize) {
        stack.shift()
      }
    }

    this.lastEntryTime.set(nodeId, now)

    // Clear redo stack on new change
    this.redoStacks.delete(nodeId)
  }

  private getOrCreateStack(map: Map<NodeId, UndoEntry[]>, nodeId: NodeId): UndoEntry[] {
    if (!map.has(nodeId)) map.set(nodeId, [])
    return map.get(nodeId)!
  }
}
