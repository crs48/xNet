import type { NodeChangeEvent, NodeState } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { changeAffectsCount } from './useDataExplorer'

function makeNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: 'node-1',
    schemaId: 'xnet://xnet.fyi/Task@1.0.0',
    properties: { title: 'A' },
    timestamps: {},
    deleted: false,
    createdAt: 1_700_000_000_000,
    createdBy: 'did:key:zABCDEFGHIJKLMNOP',
    updatedAt: 1_700_000_500_000,
    updatedBy: 'did:key:zABCDEFGHIJKLMNOP',
    ...overrides
  } as NodeState
}

function makeEvent(previousNode: NodeState | null, node: NodeState | null): NodeChangeEvent {
  return { change: {} as NodeChangeEvent['change'], previousNode, node, isRemote: false }
}

describe('changeAffectsCount', () => {
  it('treats a create (no previous node) as count-affecting', () => {
    expect(changeAffectsCount(makeEvent(null, makeNode()))).toBe(true)
  })

  it('treats a hard delete (node gone) as count-affecting', () => {
    expect(changeAffectsCount(makeEvent(makeNode(), null))).toBe(true)
  })

  it('treats a soft delete (deleted flag flips on) as count-affecting', () => {
    const before = makeNode({ deleted: false })
    const after = makeNode({ deleted: true })
    expect(changeAffectsCount(makeEvent(before, after))).toBe(true)
  })

  it('treats a restore (deleted flag flips off) as count-affecting', () => {
    const before = makeNode({ deleted: true })
    const after = makeNode({ deleted: false })
    expect(changeAffectsCount(makeEvent(before, after))).toBe(true)
  })

  it('treats a plain property update as NOT count-affecting', () => {
    const before = makeNode({ properties: { title: 'A' } })
    const after = makeNode({ properties: { title: 'B' } })
    expect(changeAffectsCount(makeEvent(before, after))).toBe(false)
  })
})
