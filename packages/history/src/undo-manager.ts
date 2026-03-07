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

      this.trackChange(event.change, event.previousNode)
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
      await this.applyUndoEntry(nodeId, entry)
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
      await this.applyRedoEntry(nodeId, entry)
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
    const entries = this.getBatchEntries(this.undoStacks, batchId)

    if (entries.length === 0) return false

    this.removeBatchEntries(this.undoStacks, entries)
    const operations = entries.map(({ nodeId, entry }) => this.toUndoOperation(nodeId, entry))

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

  /** Redo all changes in a batch/transaction */
  async redoBatch(batchId: string): Promise<boolean> {
    const entries = this.getBatchEntries(this.redoStacks, batchId)

    if (entries.length === 0) return false

    this.removeBatchEntries(this.redoStacks, entries)
    const operations = entries.map(({ nodeId, entry }) => this.toRedoOperation(nodeId, entry))

    this._isUndoRedoing = true
    try {
      await this.store.transaction(operations)
    } finally {
      this._isUndoRedoing = false
    }

    for (const { nodeId, entry } of entries) {
      const undoStack = this.getOrCreateStack(this.undoStacks, nodeId)
      undoStack.push(entry)
    }

    return true
  }

  /** Undo the most recent change across a scope of nodes */
  async undoLatest(nodeIds?: NodeId[]): Promise<boolean> {
    const latest = this.getLatestScopedEntry(this.undoStacks, nodeIds)
    if (!latest) return false

    return latest.entry.batchId ? this.undoBatch(latest.entry.batchId) : this.undo(latest.nodeId)
  }

  /** Redo the most recent undone change across a scope of nodes */
  async redoLatest(nodeIds?: NodeId[]): Promise<boolean> {
    const latest = this.getLatestScopedEntry(this.redoStacks, nodeIds)
    if (!latest) return false

    return latest.entry.batchId ? this.redoBatch(latest.entry.batchId) : this.redo(latest.nodeId)
  }

  /** Check if undo is available */
  canUndo(nodeId: NodeId): boolean {
    return (this.undoStacks.get(nodeId)?.length ?? 0) > 0
  }

  /** Check if redo is available */
  canRedo(nodeId: NodeId): boolean {
    return (this.redoStacks.get(nodeId)?.length ?? 0) > 0
  }

  /** Check if undo is available for any node in a scope */
  canUndoAny(nodeIds: NodeId[]): boolean {
    return nodeIds.some((nodeId) => this.canUndo(nodeId))
  }

  /** Check if redo is available for any node in a scope */
  canRedoAny(nodeIds: NodeId[]): boolean {
    return nodeIds.some((nodeId) => this.canRedo(nodeId))
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

  private trackChange(change: NodeChange, previousNode: NodeState | null): void {
    const nodeId = change.payload.nodeId
    const now = Date.now()
    const lastTime = this.lastEntryTime.get(nodeId) ?? 0

    const previousValues: Record<string, unknown> = {}
    const currentValues: Record<string, unknown> = {}
    const cached = this.preChangeState.get(nodeId)

    for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
      currentValues[key] = value
      previousValues[key] = cached?.[key] ?? previousNode?.properties[key]
    }

    this.preChangeState.delete(nodeId)

    const entry: UndoEntry = {
      changeHash: change.hash,
      nodeId,
      previousValues,
      currentValues,
      batchId: change.batchId,
      wallTime: change.wallTime,
      wasCreate: previousNode === null && change.payload.deleted === undefined,
      wasDelete: change.payload.deleted === true,
      wasRestore: change.payload.deleted === false
    }

    // Merge with previous entry if within merge interval
    const stack = this.getOrCreateStack(this.undoStacks, nodeId)
    const previousEntry = stack[stack.length - 1]
    if (
      previousEntry &&
      now - lastTime < this.options.mergeInterval &&
      this.canMergeEntries(previousEntry, entry)
    ) {
      for (const [key, value] of Object.entries(currentValues)) {
        if (!(key in previousEntry.previousValues)) {
          previousEntry.previousValues[key] = previousValues[key]
        }
        previousEntry.currentValues[key] = value
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

  private canMergeEntries(previousEntry: UndoEntry, nextEntry: UndoEntry): boolean {
    if (previousEntry.batchId !== nextEntry.batchId) {
      return false
    }

    if (
      previousEntry.wasCreate ||
      previousEntry.wasDelete ||
      previousEntry.wasRestore ||
      nextEntry.wasCreate ||
      nextEntry.wasDelete ||
      nextEntry.wasRestore
    ) {
      return false
    }

    return true
  }

  private async applyUndoEntry(nodeId: NodeId, entry: UndoEntry): Promise<void> {
    if (entry.wasCreate) {
      await this.store.delete(nodeId)
      return
    }

    if (entry.wasDelete) {
      await this.store.restore(nodeId)
      return
    }

    if (entry.wasRestore) {
      await this.store.delete(nodeId)
      return
    }

    await this.store.update(nodeId, { properties: entry.previousValues })
  }

  private async applyRedoEntry(nodeId: NodeId, entry: UndoEntry): Promise<void> {
    if (entry.wasCreate) {
      await this.store.restore(nodeId)
      return
    }

    if (entry.wasDelete) {
      await this.store.delete(nodeId)
      return
    }

    if (entry.wasRestore) {
      await this.store.restore(nodeId)
      return
    }

    await this.store.update(nodeId, { properties: entry.currentValues })
  }

  private toUndoOperation(nodeId: NodeId, entry: UndoEntry): TransactionOperation {
    if (entry.wasCreate) {
      return { type: 'delete', nodeId }
    }

    if (entry.wasDelete) {
      return { type: 'restore', nodeId }
    }

    if (entry.wasRestore) {
      return { type: 'delete', nodeId }
    }

    return {
      type: 'update',
      nodeId,
      options: { properties: entry.previousValues }
    }
  }

  private toRedoOperation(nodeId: NodeId, entry: UndoEntry): TransactionOperation {
    if (entry.wasCreate) {
      return { type: 'restore', nodeId }
    }

    if (entry.wasDelete) {
      return { type: 'delete', nodeId }
    }

    if (entry.wasRestore) {
      return { type: 'restore', nodeId }
    }

    return {
      type: 'update',
      nodeId,
      options: { properties: entry.currentValues }
    }
  }

  private getBatchEntries(
    map: Map<NodeId, UndoEntry[]>,
    batchId: string
  ): Array<{ nodeId: NodeId; entry: UndoEntry; stackIndex: number }> {
    const entries: Array<{ nodeId: NodeId; entry: UndoEntry; stackIndex: number }> = []

    for (const [nodeId, stack] of map) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].batchId === batchId) {
          entries.push({ nodeId, entry: stack[i], stackIndex: i })
        }
      }
    }

    return entries
  }

  private removeBatchEntries(
    map: Map<NodeId, UndoEntry[]>,
    entries: Array<{ nodeId: NodeId; stackIndex: number }>
  ): void {
    for (const { nodeId, stackIndex } of entries) {
      const stack = map.get(nodeId)
      if (!stack) continue
      stack.splice(stackIndex, 1)
    }
  }

  private getLatestScopedEntry(
    map: Map<NodeId, UndoEntry[]>,
    nodeIds?: NodeId[]
  ): { nodeId: NodeId; entry: UndoEntry } | null {
    const scope = nodeIds ? new Set(nodeIds) : null
    let latest: { nodeId: NodeId; entry: UndoEntry } | null = null

    for (const [nodeId, stack] of map) {
      if (scope && !scope.has(nodeId)) continue

      const entry = stack[stack.length - 1]
      if (!entry) continue

      if (!latest || entry.wallTime > latest.entry.wallTime) {
        latest = { nodeId, entry }
      }
    }

    return latest
  }
}
