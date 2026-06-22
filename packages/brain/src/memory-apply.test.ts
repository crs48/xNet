import type { MemoryRecord } from './memory'
import { describe, expect, it } from 'vitest'
import { applyMemoryOp, rememberFact, type MemoryStore } from './memory-apply'

const SCHEMA = 'xnet://xnet.fyi/MemoryItem@1.0.0'
const NOW = 1_000_000

/** A recording fake of the NodeStore write surface. */
function fakeStore() {
  const created: Array<{ id: string; properties: Record<string, unknown> }> = []
  const updated: Array<{ id: string; properties: Record<string, unknown> }> = []
  const deleted: string[] = []
  let seq = 0
  const store: MemoryStore = {
    async create(input) {
      const id = `mem${++seq}`
      created.push({ id, properties: input.properties })
      return { id }
    },
    async update(id, input) {
      updated.push({ id, properties: input.properties })
      return {}
    },
    async delete(id) {
      deleted.push(id)
    }
  }
  return { store, created, updated, deleted }
}

describe('applyMemoryOp', () => {
  it('creates a node for ADD with stamped lastUsedAt + evidence', async () => {
    const { store, created } = fakeStore()
    const result = await applyMemoryOp({ op: 'ADD', text: 'likes tea', salience: 0.5 }, store, {
      schemaId: SCHEMA,
      now: NOW,
      evidence: ['n1', 'n2']
    })
    expect(result).toEqual({ op: 'ADD', id: 'mem1' })
    expect(created[0].properties).toMatchObject({
      kind: 'fact',
      text: 'likes tea',
      salience: 0.5,
      lastUsedAt: NOW,
      decay: 0,
      evidence: ['n1', 'n2']
    })
  })

  it('omits evidence when none is given', async () => {
    const { store, created } = fakeStore()
    await applyMemoryOp({ op: 'ADD', text: 'x', salience: 0.5 }, store, {
      schemaId: SCHEMA,
      now: NOW
    })
    expect(created[0].properties).not.toHaveProperty('evidence')
  })

  it('updates the existing node for UPDATE', async () => {
    const { store, updated } = fakeStore()
    const result = await applyMemoryOp(
      { op: 'UPDATE', id: 'mem9', text: 'new', salience: 0.7 },
      store,
      { schemaId: SCHEMA, now: NOW }
    )
    expect(result).toEqual({ op: 'UPDATE', id: 'mem9' })
    expect(updated[0]).toEqual({
      id: 'mem9',
      properties: { text: 'new', salience: 0.7, lastUsedAt: NOW }
    })
  })

  it('deletes for DELETE', async () => {
    const { store, deleted } = fakeStore()
    const result = await applyMemoryOp({ op: 'DELETE', id: 'mem3' }, store, {
      schemaId: SCHEMA,
      now: NOW
    })
    expect(result).toEqual({ op: 'DELETE', id: 'mem3' })
    expect(deleted).toEqual(['mem3'])
  })

  it('does nothing for NOOP', async () => {
    const { store, created, updated, deleted } = fakeStore()
    const result = await applyMemoryOp({ op: 'NOOP', reason: 'dup' }, store, {
      schemaId: SCHEMA,
      now: NOW
    })
    expect(result).toEqual({ op: 'NOOP', reason: 'dup' })
    expect([created, updated, deleted].every((a) => a.length === 0)).toBe(true)
  })

  it('honors a custom kind', async () => {
    const { store, created } = fakeStore()
    await applyMemoryOp({ op: 'ADD', text: 'dark mode', salience: 0.6 }, store, {
      schemaId: SCHEMA,
      now: NOW,
      kind: 'preference'
    })
    expect(created[0].properties.kind).toBe('preference')
  })
})

describe('rememberFact', () => {
  it('ADDs a novel fact', async () => {
    const { store, created } = fakeStore()
    const result = await rememberFact({ text: 'user is in Berlin' }, [], store, {
      schemaId: SCHEMA,
      now: NOW
    })
    expect(result.op).toBe('ADD')
    expect(created).toHaveLength(1)
  })

  it('UPDATEs when the fact matches an existing memory on topic', async () => {
    const existing: MemoryRecord[] = [
      { id: 'mem1', text: 'user lives in Berlin Germany', salience: 0.5, lastUsedAt: 0 }
    ]
    const { store, updated } = fakeStore()
    const result = await rememberFact({ text: 'user lives in Berlin now' }, existing, store, {
      schemaId: SCHEMA,
      now: NOW
    })
    expect(result.op).toBe('UPDATE')
    expect(updated[0].id).toBe('mem1')
  })
})
