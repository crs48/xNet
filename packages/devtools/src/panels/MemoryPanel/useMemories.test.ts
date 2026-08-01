/**
 * Memory console builders (exploration 0415).
 *
 * The panel exists to satisfy one rule — a memory the user cannot see is not a
 * memory — so what these cover is what the list *shows*: the same ranking
 * retrieval uses, and an honest mark for which memories actually reach a
 * session's context.
 */

import type { NodeState } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { buildMemoryRows, buildProfileRow, PREAMBLE_LIMIT } from './useMemories'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

function memory(
  id: string,
  text: string,
  salience: number,
  ageDays = 0,
  extra: Record<string, unknown> = {}
): NodeState {
  return {
    id,
    schemaId: 'xnet://xnet.fyi/MemoryItem@1.0.0',
    properties: { text, salience, lastUsedAt: NOW - ageDays * DAY, kind: 'fact', ...extra },
    deleted: false,
    createdAt: NOW,
    updatedAt: NOW
  } as unknown as NodeState
}

describe('buildMemoryRows', () => {
  it('ranks by recency-decayed salience, not by creation order', () => {
    const rows = buildMemoryRows(
      [
        memory('old', 'Stale but once important', 0.9, 365),
        memory('fresh', 'Recent and moderately important', 0.6, 1)
      ],
      NOW
    )
    // A 0.9-salience memory a year old must lose to a 0.6 from yesterday — that
    // is what retrieval does, so it is what the panel has to show.
    expect(rows.map((r) => r.id)).toEqual(['fresh', 'old'])
    expect(rows[0].score).toBeGreaterThan(rows[1].score)
  })

  it('skips deleted and text-less nodes rather than rendering blanks', () => {
    const deleted = { ...memory('d', 'Gone', 0.5), deleted: true } as NodeState
    const blank = memory('b', '   ', 0.5)
    expect(buildMemoryRows([deleted, blank, memory('ok', 'Kept', 0.5)], NOW)).toHaveLength(1)
  })

  it('carries evidence so a distilled memory is auditable', () => {
    const rows = buildMemoryRows(
      [
        memory('m', 'Always file under Ops', 0.7, 0, {
          evidence: ['a1', 'a2', 'a3'],
          kind: 'preference'
        })
      ],
      NOW
    )
    expect(rows[0].evidence).toEqual(['a1', 'a2', 'a3'])
    expect(rows[0].kind).toBe('preference')
  })

  it('defaults missing salience rather than dropping the memory', () => {
    const rows = buildMemoryRows(
      [
        {
          id: 'm',
          schemaId: 'xnet://xnet.fyi/MemoryItem@1.0.0',
          properties: { text: 'No salience recorded' },
          deleted: false,
          createdAt: NOW,
          updatedAt: NOW
        } as unknown as NodeState
      ],
      NOW
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].salience).toBe(0.5)
  })

  it('the preamble cut-off matches what the CLI carries', () => {
    const rows = buildMemoryRows(
      Array.from({ length: 12 }, (_, i) => memory(`m${i}`, `Fact ${i}`, 0.9 - i * 0.05)),
      NOW
    )
    expect(rows.slice(0, PREAMBLE_LIMIT)).toHaveLength(8)
  })
})

describe('buildProfileRow', () => {
  it('returns null when no profile has been adopted', () => {
    expect(buildProfileRow([])).toBeNull()
  })

  it('reads the adopted profile and the reason it was accepted', () => {
    const node = {
      id: 'p1',
      schemaId: 'xnet://xnet.fyi/RetrievalProfile@1.0.0',
      properties: {
        hopDecay: 0.6,
        vectorWeight: 0.4,
        maxEntries: 16,
        rerank: true,
        reason: 'improved without regressing',
        adoptedAt: NOW
      },
      deleted: false,
      createdAt: NOW,
      updatedAt: NOW
    } as unknown as NodeState
    expect(buildProfileRow([node])).toEqual({
      id: 'p1',
      hopDecay: 0.6,
      vectorWeight: 0.4,
      maxEntries: 16,
      rerank: true,
      reason: 'improved without regressing',
      adoptedAt: NOW
    })
  })
})
