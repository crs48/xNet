/**
 * DocumentHistoryEngine - Yjs document time travel
 *
 * Manages Yjs snapshots for rich text / database document content.
 * Captures snapshots on save, reconstructs past states, and provides
 * document-level timeline entries for the unified History panel.
 *
 * Uses Yjs-native snapshot mechanism (Y.snapshot / Y.createDocFromSnapshot)
 * which requires gc: false on all Y.Doc instances.
 */

import * as Y from 'yjs'
import type { NodeId } from '@xnet/data'
import type {
  YjsSnapshot,
  YjsSnapshotStorageAdapter,
  DocumentTimelineEntry,
  UnifiedTimelineEntry,
  TimelineEntry
} from './types'

// ─── Configuration ───────────────────────────────────────────

export interface DocumentHistoryOptions {
  /** Minimum interval between snapshots in ms (default: 5000) */
  minInterval: number
  /** Maximum snapshots to keep per node (default: 100) */
  maxPerNode: number
}

const DEFAULT_OPTIONS: DocumentHistoryOptions = {
  minInterval: 5000,
  maxPerNode: 100
}

// ─── DocumentHistoryEngine ───────────────────────────────────

export class DocumentHistoryEngine {
  private options: DocumentHistoryOptions
  private lastSnapshotTime = new Map<NodeId, number>()

  constructor(
    private snapshotStorage: YjsSnapshotStorageAdapter,
    options?: Partial<DocumentHistoryOptions>
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Capture a snapshot of a Y.Doc's current state.
   * Called when document content is saved (setDocumentContent).
   * Respects minInterval to avoid excessive snapshots.
   */
  async captureSnapshot(nodeId: NodeId, doc: Y.Doc): Promise<YjsSnapshot | null> {
    const now = Date.now()
    const lastTime = this.lastSnapshotTime.get(nodeId) ?? 0

    if (now - lastTime < this.options.minInterval) {
      return null
    }

    const snapshot = Y.snapshot(doc)
    const snapshotBytes = Y.encodeSnapshot(snapshot)
    const docState = Y.encodeStateAsUpdate(doc)

    const entry: YjsSnapshot = {
      nodeId,
      timestamp: now,
      snapshot: snapshotBytes,
      docState,
      byteSize: snapshotBytes.byteLength + docState.byteLength
    }

    await this.snapshotStorage.saveYjsSnapshot(entry)
    this.lastSnapshotTime.set(nodeId, now)

    // Evict old snapshots if over limit
    await this.evictIfNeeded(nodeId)

    return entry
  }

  /**
   * Force capture a snapshot regardless of minInterval.
   * Used by seed data and explicit save actions.
   */
  async forceCapture(nodeId: NodeId, doc: Y.Doc): Promise<YjsSnapshot> {
    const snapshot = Y.snapshot(doc)
    const snapshotBytes = Y.encodeSnapshot(snapshot)
    const docState = Y.encodeStateAsUpdate(doc)

    const entry: YjsSnapshot = {
      nodeId,
      timestamp: Date.now(),
      snapshot: snapshotBytes,
      docState,
      byteSize: snapshotBytes.byteLength + docState.byteLength
    }

    await this.snapshotStorage.saveYjsSnapshot(entry)
    this.lastSnapshotTime.set(nodeId, entry.timestamp)

    await this.evictIfNeeded(nodeId)

    return entry
  }

  /**
   * Get all snapshots for a node, sorted by timestamp ascending.
   */
  async getSnapshots(nodeId: NodeId): Promise<YjsSnapshot[]> {
    const snapshots = await this.snapshotStorage.getYjsSnapshots(nodeId)
    return snapshots.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get snapshot count for a node.
   */
  async getSnapshotCount(nodeId: NodeId): Promise<number> {
    const snapshots = await this.snapshotStorage.getYjsSnapshots(nodeId)
    return snapshots.length
  }

  /**
   * Reconstruct a Y.Doc at a specific snapshot index.
   * Returns a new Y.Doc with the historical state applied.
   */
  async reconstructAt(nodeId: NodeId, snapshotIndex: number): Promise<Y.Doc | null> {
    const snapshots = await this.getSnapshots(nodeId)
    if (snapshotIndex < 0 || snapshotIndex >= snapshots.length) {
      return null
    }

    const entry = snapshots[snapshotIndex]
    const doc = new Y.Doc({ gc: false })
    Y.applyUpdate(doc, entry.docState)

    return doc
  }

  /**
   * Reconstruct a Y.Doc at a specific snapshot using the live doc + Yjs snapshot.
   * This is more efficient than loading docState when the live doc is available.
   */
  reconstructFromLiveDoc(liveDoc: Y.Doc, snapshotBytes: Uint8Array): Y.Doc {
    const snapshot = Y.decodeSnapshot(snapshotBytes)
    return Y.createDocFromSnapshot(liveDoc, snapshot)
  }

  /**
   * Get document timeline entries for merging into the unified timeline.
   */
  async getDocumentTimeline(nodeId: NodeId): Promise<DocumentTimelineEntry[]> {
    const snapshots = await this.getSnapshots(nodeId)

    return snapshots.map((snap, index) => ({
      type: 'document' as const,
      snapshotIndex: index,
      wallTime: snap.timestamp,
      byteSize: snap.byteSize
    }))
  }

  /**
   * Create a unified timeline that merges property changes and document snapshots,
   * sorted by wallTime.
   */
  mergeTimelines(
    propertyTimeline: TimelineEntry[],
    documentTimeline: DocumentTimelineEntry[]
  ): UnifiedTimelineEntry[] {
    const unified: UnifiedTimelineEntry[] = [
      ...propertyTimeline.map((entry) => ({ ...entry, type: 'property' as const })),
      ...documentTimeline
    ]

    return unified.sort((a, b) => a.wallTime - b.wallTime)
  }

  /**
   * Compare two document snapshots and return a text summary of changes.
   * Uses Yjs snapshot comparison.
   */
  async diffSnapshots(
    nodeId: NodeId,
    fromIndex: number,
    toIndex: number
  ): Promise<DocumentDiffResult> {
    const snapshots = await this.getSnapshots(nodeId)

    if (
      fromIndex < 0 ||
      fromIndex >= snapshots.length ||
      toIndex < 0 ||
      toIndex >= snapshots.length
    ) {
      throw new Error(`Snapshot index out of range [0, ${snapshots.length - 1}]`)
    }

    const fromSnap = snapshots[fromIndex]
    const toSnap = snapshots[toIndex]

    // Reconstruct both docs
    const fromDoc = new Y.Doc({ gc: false })
    Y.applyUpdate(fromDoc, fromSnap.docState)

    const toDoc = new Y.Doc({ gc: false })
    Y.applyUpdate(toDoc, toSnap.docState)

    // Extract text content for comparison
    const fromText = extractTextContent(fromDoc)
    const toText = extractTextContent(toDoc)

    // Compute size delta
    const sizeDelta = toSnap.byteSize - fromSnap.byteSize

    fromDoc.destroy()
    toDoc.destroy()

    return {
      nodeId,
      fromIndex,
      toIndex,
      fromTimestamp: fromSnap.timestamp,
      toTimestamp: toSnap.timestamp,
      fromText,
      toText,
      sizeDelta,
      fromSize: fromSnap.byteSize,
      toSize: toSnap.byteSize
    }
  }

  /**
   * Clear all snapshots for a node.
   */
  async clearSnapshots(nodeId: NodeId): Promise<void> {
    await this.snapshotStorage.deleteYjsSnapshots(nodeId)
    this.lastSnapshotTime.delete(nodeId)
  }

  /**
   * Get storage metrics for a node's document snapshots.
   */
  async getStorageMetrics(nodeId: NodeId): Promise<DocumentStorageMetrics> {
    const snapshots = await this.getSnapshots(nodeId)
    const totalBytes = snapshots.reduce((sum, s) => sum + s.byteSize, 0)

    return {
      snapshotCount: snapshots.length,
      totalBytes,
      oldestSnapshot: snapshots.length > 0 ? snapshots[0].timestamp : 0,
      newestSnapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : 0
    }
  }

  // ─── Private ────────────────────────────────────────────────

  private async evictIfNeeded(nodeId: NodeId): Promise<void> {
    const snapshots = await this.getSnapshots(nodeId)
    if (snapshots.length <= this.options.maxPerNode) return

    // Keep the most recent maxPerNode snapshots by deleting all and re-saving
    const toKeep = snapshots.slice(-this.options.maxPerNode)
    await this.snapshotStorage.deleteYjsSnapshots(nodeId)
    for (const snap of toKeep) {
      await this.snapshotStorage.saveYjsSnapshot(snap)
    }
  }
}

// ─── Diff Result Type ────────────────────────────────────────

export interface DocumentDiffResult {
  nodeId: NodeId
  fromIndex: number
  toIndex: number
  fromTimestamp: number
  toTimestamp: number
  fromText: string
  toText: string
  sizeDelta: number
  fromSize: number
  toSize: number
}

export interface DocumentStorageMetrics {
  snapshotCount: number
  totalBytes: number
  oldestSnapshot: number
  newestSnapshot: number
}

// ─── Memory Storage Adapter ──────────────────────────────────

/**
 * In-memory Yjs snapshot storage for testing and devtools.
 */
export class MemoryYjsSnapshotStorage implements YjsSnapshotStorageAdapter {
  private snapshots: YjsSnapshot[] = []

  async saveYjsSnapshot(snapshot: YjsSnapshot): Promise<void> {
    this.snapshots.push(structuredClone(snapshot))
  }

  async getYjsSnapshots(nodeId: NodeId): Promise<YjsSnapshot[]> {
    return this.snapshots.filter((s) => s.nodeId === nodeId).map((s) => structuredClone(s))
  }

  async deleteYjsSnapshots(nodeId: NodeId): Promise<void> {
    this.snapshots = this.snapshots.filter((s) => s.nodeId !== nodeId)
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.snapshots = []
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extract plain text from a Y.Doc for diff display.
 * Looks for common xNet fragment names.
 */
function extractTextContent(doc: Y.Doc): string {
  const parts: string[] = []

  // Rich text content (pages)
  try {
    const content = doc.getXmlFragment('content')
    if (content.length > 0) {
      parts.push(xmlFragmentToText(content))
    }
  } catch {
    // No content fragment
  }

  // Database data
  try {
    const dataMap = doc.getMap('data')
    if (dataMap.size > 0) {
      const rows = dataMap.get('rows')
      if (Array.isArray(rows)) {
        parts.push(`[${rows.length} rows]`)
        for (const row of rows.slice(0, 5)) {
          if (row && typeof row === 'object') {
            const cells = Object.entries(row)
              .filter(([k]) => k !== 'id')
              .map(([k, v]) => `${k}: ${String(v ?? '')}`.slice(0, 50))
              .join(', ')
            if (cells) parts.push(`  ${cells}`)
          }
        }
        if (rows.length > 5) parts.push(`  ... and ${rows.length - 5} more rows`)
      }
    }
  } catch {
    // No data map
  }

  // Metadata
  try {
    const meta = doc.getMap('metadata')
    if (meta.size > 0) {
      const title = meta.get('title')
      if (title) parts.unshift(`Title: ${String(title)}`)
    }
  } catch {
    // No metadata
  }

  return parts.join('\n')
}

/**
 * Convert a Y.XmlFragment to plain text (simplified).
 */
function xmlFragmentToText(fragment: Y.XmlFragment): string {
  const parts: string[] = []

  for (let i = 0; i < fragment.length; i++) {
    const item = fragment.get(i)
    if (item instanceof Y.XmlText) {
      parts.push(item.toString())
    } else if (item instanceof Y.XmlElement) {
      // Recursively extract text from child elements
      const childText = xmlElementToText(item)
      if (childText) parts.push(childText)
    }
  }

  return parts.join('\n')
}

/**
 * Convert a Y.XmlElement to plain text (simplified).
 */
function xmlElementToText(element: Y.XmlElement): string {
  const parts: string[] = []

  for (let i = 0; i < element.length; i++) {
    const item = element.get(i)
    if (item instanceof Y.XmlText) {
      parts.push(item.toString())
    } else if (item instanceof Y.XmlElement) {
      parts.push(xmlElementToText(item))
    }
  }

  return parts.join('')
}
