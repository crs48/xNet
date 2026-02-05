/**
 * Tests for DocumentHistoryEngine — Yjs document time travel
 */

import type { NodeId } from '@xnet/data'
import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  DocumentHistoryEngine,
  MemoryYjsSnapshotStorage,
  type DocumentHistoryOptions
} from './document-history'

// ─── Test Fixtures ───────────────────────────────────────────

const NODE_A = 'node-a' as NodeId
const NODE_B = 'node-b' as NodeId

function createTestDoc(text?: string): Y.Doc {
  const doc = new Y.Doc({ gc: false })
  if (text) {
    const content = doc.getXmlFragment('content')
    const paragraph = new Y.XmlElement('paragraph')
    const textNode = new Y.XmlText()
    textNode.insert(0, text)
    paragraph.insert(0, [textNode])
    content.insert(0, [paragraph])
  }
  return doc
}

function createEngine(options?: Partial<DocumentHistoryOptions>): {
  engine: DocumentHistoryEngine
  storage: MemoryYjsSnapshotStorage
} {
  const storage = new MemoryYjsSnapshotStorage()
  const engine = new DocumentHistoryEngine(storage, { minInterval: 0, ...options })
  return { engine, storage }
}

// ─── Tests ───────────────────────────────────────────────────

describe('DocumentHistoryEngine', () => {
  describe('captureSnapshot', () => {
    it('should capture a snapshot from a Y.Doc', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello world')

      const snap = await engine.captureSnapshot(NODE_A, doc)

      expect(snap).not.toBeNull()
      expect(snap!.nodeId).toBe(NODE_A)
      expect(snap!.snapshot).toBeInstanceOf(Uint8Array)
      expect(snap!.docState).toBeInstanceOf(Uint8Array)
      expect(snap!.byteSize).toBeGreaterThan(0)
      expect(snap!.timestamp).toBeGreaterThan(0)

      doc.destroy()
    })

    it('should respect minInterval', async () => {
      const { engine } = createEngine({ minInterval: 60000 })
      const doc = createTestDoc('Hello')

      const snap1 = await engine.captureSnapshot(NODE_A, doc)
      expect(snap1).not.toBeNull()

      // Second capture should be throttled
      const snap2 = await engine.captureSnapshot(NODE_A, doc)
      expect(snap2).toBeNull()

      doc.destroy()
    })

    it('should allow capture for different nodes even within minInterval', async () => {
      const { engine } = createEngine({ minInterval: 60000 })
      const doc = createTestDoc('Hello')

      const snap1 = await engine.captureSnapshot(NODE_A, doc)
      expect(snap1).not.toBeNull()

      const snap2 = await engine.captureSnapshot(NODE_B, doc)
      expect(snap2).not.toBeNull()

      doc.destroy()
    })
  })

  describe('forceCapture', () => {
    it('should capture regardless of minInterval', async () => {
      const { engine } = createEngine({ minInterval: 60000 })
      const doc = createTestDoc('Hello')

      const snap1 = await engine.forceCapture(NODE_A, doc)
      expect(snap1).toBeDefined()

      const snap2 = await engine.forceCapture(NODE_A, doc)
      expect(snap2).toBeDefined()

      const count = await engine.getSnapshotCount(NODE_A)
      expect(count).toBe(2)

      doc.destroy()
    })
  })

  describe('getSnapshots', () => {
    it('should return snapshots sorted by timestamp', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('v1')

      await engine.forceCapture(NODE_A, doc)

      // Modify doc
      const content = doc.getXmlFragment('content')
      const p = new Y.XmlElement('paragraph')
      const t = new Y.XmlText()
      t.insert(0, 'v2')
      p.insert(0, [t])
      content.insert(content.length, [p])

      await engine.forceCapture(NODE_A, doc)

      const snapshots = await engine.getSnapshots(NODE_A)
      expect(snapshots).toHaveLength(2)
      expect(snapshots[0].timestamp).toBeLessThanOrEqual(snapshots[1].timestamp)

      doc.destroy()
    })

    it('should return empty array for unknown node', async () => {
      const { engine } = createEngine()
      const snapshots = await engine.getSnapshots(NODE_A)
      expect(snapshots).toHaveLength(0)
    })
  })

  describe('reconstructAt', () => {
    it('should reconstruct a Y.Doc at a specific snapshot', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello')
      await engine.forceCapture(NODE_A, doc)

      const reconstructed = await engine.reconstructAt(NODE_A, 0)
      expect(reconstructed).not.toBeNull()
      expect(reconstructed).toBeInstanceOf(Y.Doc)

      reconstructed!.destroy()
      doc.destroy()
    })

    it('should return null for out-of-range index', async () => {
      const { engine } = createEngine()
      const result = await engine.reconstructAt(NODE_A, 0)
      expect(result).toBeNull()

      const doc = createTestDoc('Hello')
      await engine.forceCapture(NODE_A, doc)

      const result2 = await engine.reconstructAt(NODE_A, 5)
      expect(result2).toBeNull()

      const result3 = await engine.reconstructAt(NODE_A, -1)
      expect(result3).toBeNull()

      doc.destroy()
    })
  })

  describe('reconstructFromLiveDoc', () => {
    it('should reconstruct using Yjs native snapshot mechanism', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Initial text')

      const snap = await engine.forceCapture(NODE_A, doc)

      // Modify after snapshot
      const content = doc.getXmlFragment('content')
      const p = new Y.XmlElement('paragraph')
      const t = new Y.XmlText()
      t.insert(0, 'Added later')
      p.insert(0, [t])
      content.insert(content.length, [p])

      // Reconstruct from live doc at the snapshot point
      const historical = engine.reconstructFromLiveDoc(doc, snap.snapshot)
      expect(historical).toBeInstanceOf(Y.Doc)

      historical.destroy()
      doc.destroy()
    })
  })

  describe('getDocumentTimeline', () => {
    it('should return timeline entries with correct structure', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('v1')
      await engine.forceCapture(NODE_A, doc)
      await engine.forceCapture(NODE_A, doc)

      const timeline = await engine.getDocumentTimeline(NODE_A)
      expect(timeline).toHaveLength(2)

      for (const entry of timeline) {
        expect(entry.type).toBe('document')
        expect(entry.wallTime).toBeGreaterThan(0)
        expect(entry.byteSize).toBeGreaterThan(0)
        expect(typeof entry.snapshotIndex).toBe('number')
      }

      expect(timeline[0].snapshotIndex).toBe(0)
      expect(timeline[1].snapshotIndex).toBe(1)

      doc.destroy()
    })
  })

  describe('mergeTimelines', () => {
    it('should merge and sort property + document timelines by wallTime', async () => {
      const { engine } = createEngine()

      const propertyTimeline = [
        {
          wallTime: 100,
          operation: 'create',
          properties: ['title'],
          author: 'did:key:a',
          lamport: { time: 1, node: 'a' }
        },
        {
          wallTime: 300,
          operation: 'update',
          properties: ['status'],
          author: 'did:key:a',
          lamport: { time: 3, node: 'a' }
        }
      ] as any

      const documentTimeline = [
        { type: 'document' as const, snapshotIndex: 0, wallTime: 200, byteSize: 100 }
      ]

      const unified = engine.mergeTimelines(propertyTimeline, documentTimeline)
      expect(unified).toHaveLength(3)
      expect(unified[0].wallTime).toBe(100)
      expect(unified[1].wallTime).toBe(200)
      expect(unified[1].type).toBe('document')
      expect(unified[2].wallTime).toBe(300)
    })
  })

  describe('diffSnapshots', () => {
    it('should diff two snapshots and return text comparison', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('First version')
      await engine.forceCapture(NODE_A, doc)

      // Modify
      const content = doc.getXmlFragment('content')
      const p = new Y.XmlElement('paragraph')
      const t = new Y.XmlText()
      t.insert(0, 'Second version')
      p.insert(0, [t])
      content.insert(content.length, [p])
      await engine.forceCapture(NODE_A, doc)

      const diff = await engine.diffSnapshots(NODE_A, 0, 1)
      expect(diff.nodeId).toBe(NODE_A)
      expect(diff.fromIndex).toBe(0)
      expect(diff.toIndex).toBe(1)
      expect(diff.fromTimestamp).toBeGreaterThan(0)
      expect(diff.toTimestamp).toBeGreaterThanOrEqual(diff.fromTimestamp)
      expect(typeof diff.fromText).toBe('string')
      expect(typeof diff.toText).toBe('string')
      expect(typeof diff.sizeDelta).toBe('number')

      doc.destroy()
    })

    it('should throw for out-of-range indices', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello')
      await engine.forceCapture(NODE_A, doc)

      await expect(engine.diffSnapshots(NODE_A, 0, 5)).rejects.toThrow('out of range')

      doc.destroy()
    })
  })

  describe('clearSnapshots', () => {
    it('should remove all snapshots for a node', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello')
      await engine.forceCapture(NODE_A, doc)
      await engine.forceCapture(NODE_A, doc)

      expect(await engine.getSnapshotCount(NODE_A)).toBe(2)

      await engine.clearSnapshots(NODE_A)
      expect(await engine.getSnapshotCount(NODE_A)).toBe(0)

      doc.destroy()
    })

    it('should not affect other nodes', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello')
      await engine.forceCapture(NODE_A, doc)
      await engine.forceCapture(NODE_B, doc)

      await engine.clearSnapshots(NODE_A)
      expect(await engine.getSnapshotCount(NODE_A)).toBe(0)
      expect(await engine.getSnapshotCount(NODE_B)).toBe(1)

      doc.destroy()
    })
  })

  describe('getStorageMetrics', () => {
    it('should return correct metrics', async () => {
      const { engine } = createEngine()
      const doc = createTestDoc('Hello world')
      await engine.forceCapture(NODE_A, doc)
      await engine.forceCapture(NODE_A, doc)

      const metrics = await engine.getStorageMetrics(NODE_A)
      expect(metrics.snapshotCount).toBe(2)
      expect(metrics.totalBytes).toBeGreaterThan(0)
      expect(metrics.oldestSnapshot).toBeGreaterThan(0)
      expect(metrics.newestSnapshot).toBeGreaterThanOrEqual(metrics.oldestSnapshot)

      doc.destroy()
    })

    it('should return zero metrics for unknown node', async () => {
      const { engine } = createEngine()
      const metrics = await engine.getStorageMetrics(NODE_A)
      expect(metrics.snapshotCount).toBe(0)
      expect(metrics.totalBytes).toBe(0)
      expect(metrics.oldestSnapshot).toBe(0)
      expect(metrics.newestSnapshot).toBe(0)
    })
  })

  describe('eviction', () => {
    it('should evict oldest snapshots when exceeding maxPerNode', async () => {
      const { engine } = createEngine({ maxPerNode: 3 })
      const doc = createTestDoc('test')

      for (let i = 0; i < 5; i++) {
        await engine.forceCapture(NODE_A, doc)
      }

      const count = await engine.getSnapshotCount(NODE_A)
      expect(count).toBe(3)

      doc.destroy()
    })
  })
})

describe('MemoryYjsSnapshotStorage', () => {
  let storage: MemoryYjsSnapshotStorage

  beforeEach(() => {
    storage = new MemoryYjsSnapshotStorage()
  })

  it('should save and retrieve snapshots', async () => {
    const snap = {
      nodeId: NODE_A,
      timestamp: Date.now(),
      snapshot: new Uint8Array([1, 2, 3]),
      docState: new Uint8Array([4, 5, 6]),
      byteSize: 6
    }

    await storage.saveYjsSnapshot(snap)
    const result = await storage.getYjsSnapshots(NODE_A)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe(NODE_A)
  })

  it('should filter by nodeId', async () => {
    await storage.saveYjsSnapshot({
      nodeId: NODE_A,
      timestamp: 1,
      snapshot: new Uint8Array(),
      docState: new Uint8Array(),
      byteSize: 0
    })
    await storage.saveYjsSnapshot({
      nodeId: NODE_B,
      timestamp: 2,
      snapshot: new Uint8Array(),
      docState: new Uint8Array(),
      byteSize: 0
    })

    const resultA = await storage.getYjsSnapshots(NODE_A)
    expect(resultA).toHaveLength(1)

    const resultB = await storage.getYjsSnapshots(NODE_B)
    expect(resultB).toHaveLength(1)
  })

  it('should delete snapshots by nodeId', async () => {
    await storage.saveYjsSnapshot({
      nodeId: NODE_A,
      timestamp: 1,
      snapshot: new Uint8Array(),
      docState: new Uint8Array(),
      byteSize: 0
    })
    await storage.saveYjsSnapshot({
      nodeId: NODE_B,
      timestamp: 2,
      snapshot: new Uint8Array(),
      docState: new Uint8Array(),
      byteSize: 0
    })

    await storage.deleteYjsSnapshots(NODE_A)
    expect(await storage.getYjsSnapshots(NODE_A)).toHaveLength(0)
    expect(await storage.getYjsSnapshots(NODE_B)).toHaveLength(1)
  })

  it('should clear all data', () => {
    storage.clear()
    // No error thrown, and subsequent queries return empty
  })
})
