/**
 * Tests for persisted warm-start snapshots (exploration 0264).
 */
import type { WarmStartQuerySnapshot } from '@xnetjs/data-bridge'
import { SCHEMA_VERSION } from '@xnetjs/sqlite'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWarmStartSnapshots,
  loadWarmStartSnapshots,
  saveWarmStartSnapshots
} from './warm-start-snapshots'

const DID = 'did:key:z6MkwarmStartTester'

function entry(id: string): WarmStartQuerySnapshot {
  return {
    queryId: `q-${id}`,
    descriptor: { schemaId: 'xnet://test/Task@1.0.0' } as never,
    nodes: [
      {
        id,
        schemaId: 'xnet://test/Task@1.0.0',
        properties: { title: id },
        timestamps: {},
        deleted: false,
        createdAt: 1,
        createdBy: DID,
        updatedAt: 1,
        updatedBy: DID
      } as never
    ]
  }
}

describe('warm-start snapshots (0264)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips entries for the same identity and schema version', () => {
    expect(saveWarmStartSnapshots(DID, [entry('a'), entry('b')])).toBe(true)
    const loaded = loadWarmStartSnapshots(DID)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].queryId).toBe('q-a')
  })

  it('treats a different identity as a miss and clears the file', () => {
    saveWarmStartSnapshots(DID, [entry('a')])
    expect(loadWarmStartSnapshots('did:key:z6MkSomeoneElse')).toEqual([])
    // The mismatched file was dropped — the original DID misses too now.
    expect(loadWarmStartSnapshots(DID)).toEqual([])
  })

  it('treats a schema-version change as a miss', () => {
    saveWarmStartSnapshots(DID, [entry('a')])
    const raw = JSON.parse(localStorage.getItem('xnet:warm-start:v1')!)
    raw.schemaVersion = SCHEMA_VERSION - 1
    localStorage.setItem('xnet:warm-start:v1', JSON.stringify(raw))
    expect(loadWarmStartSnapshots(DID)).toEqual([])
  })

  it('skips oversized snapshots instead of truncating', () => {
    const huge = entry('big')
    huge.nodes = Array.from({ length: 5000 }, (_, i) => ({
      ...huge.nodes[0],
      id: `big-${i}`,
      properties: { title: 'x'.repeat(200) }
    }))
    expect(saveWarmStartSnapshots(DID, [huge])).toBe(false)
    expect(loadWarmStartSnapshots(DID)).toEqual([])
  })

  it('tolerates corrupted storage and supports explicit clear', () => {
    localStorage.setItem('xnet:warm-start:v1', '{nope')
    expect(loadWarmStartSnapshots(DID)).toEqual([])
    saveWarmStartSnapshots(DID, [entry('a')])
    clearWarmStartSnapshots()
    expect(loadWarmStartSnapshots(DID)).toEqual([])
  })

  it('does not persist empty working sets', () => {
    expect(saveWarmStartSnapshots(DID, [])).toBe(false)
    expect(localStorage.getItem('xnet:warm-start:v1')).toBeNull()
  })
})
