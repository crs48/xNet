import type { NodeState, Schema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { deriveCellLocks, restrictedFieldNames, type WriteDecision } from './useCellPermissions'

function node(id: string, props: Record<string, unknown> = {}): NodeState {
  return {
    id,
    schemaId: 'xnet://x/Task@1.0.0',
    properties: props,
    timestamps: {},
    deleted: false,
    createdAt: 0,
    createdBy: 'did:key:z1',
    updatedAt: 0,
    updatedBy: 'did:key:z1'
  } as NodeState
}

describe('restrictedFieldNames', () => {
  it('returns the field names that carry a field rule', () => {
    const schema = { authorization: { fieldRules: { title: {}, status: {} } } } as unknown as Schema
    expect([...restrictedFieldNames(schema)].sort()).toEqual(['status', 'title'])
  })
  it('is empty with no schema / no rules', () => {
    expect(restrictedFieldNames(null).size).toBe(0)
    expect(restrictedFieldNames({ authorization: {} } as unknown as Schema).size).toBe(0)
  })
})

describe('deriveCellLocks', () => {
  const editableFieldIds = ['title', 'count']

  it('locks every editable cell of a non-writable node, with the reason', () => {
    const nodeWrite = new Map<string, WriteDecision>([
      ['n1', { allowed: false, reasons: ['DENY_NO_ROLE_MATCH'] }]
    ])
    const locks = deriveCellLocks({
      nodes: [node('n1')],
      editableFieldIds,
      restricted: new Set(),
      nodeWrite,
      fieldWrite: new Map()
    })
    expect(locks.get('n1:title')).toMatch(/can't edit this node/)
    expect(locks.get('n1:title')).toMatch(/no role/)
    expect(locks.get('n1:count')).toBeTruthy()
  })

  it('leaves a writable node unlocked', () => {
    const nodeWrite = new Map<string, WriteDecision>([['n1', { allowed: true, reasons: [] }]])
    const locks = deriveCellLocks({
      nodes: [node('n1')],
      editableFieldIds,
      restricted: new Set(),
      nodeWrite,
      fieldWrite: new Map()
    })
    expect(locks.size).toBe(0)
  })

  it('locks only the restricted field when the node is writable but a field rule denies', () => {
    const nodeWrite = new Map<string, WriteDecision>([['n1', { allowed: true, reasons: [] }]])
    const fieldWrite = new Map<string, boolean>([['n1:title', false]])
    const locks = deriveCellLocks({
      nodes: [node('n1')],
      editableFieldIds,
      restricted: new Set(['title']),
      nodeWrite,
      fieldWrite
    })
    expect(locks.get('n1:title')).toMatch(/field is restricted/)
    expect(locks.has('n1:count')).toBe(false)
  })

  it('is optimistic: an undecided node is not locked (avoids flicker)', () => {
    const locks = deriveCellLocks({
      nodes: [node('n1')],
      editableFieldIds,
      restricted: new Set(),
      nodeWrite: new Map(), // no decision yet
      fieldWrite: new Map()
    })
    expect(locks.size).toBe(0)
  })
})
