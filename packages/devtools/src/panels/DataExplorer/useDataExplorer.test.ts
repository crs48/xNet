import type { NodeChangeEvent, NodeState } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { changeAffectsCount, selectInUseSchemaOptions } from './useDataExplorer'

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

describe('selectInUseSchemaOptions', () => {
  const option = (iri: string) => ({ iri, label: iri.split('/').pop() ?? iri })
  const TODO = 'xnet://demos.xnet.fyi/DemoTodo@1.0.0'
  const ROOM = 'xnet://demos.xnet.fyi/DemoRoom@1.0.0'
  // Registered as import side effects (plugins/labs/conformance) — never used.
  const PLUGIN = 'xnet://xnet.fyi/Plugin@1.0.0'
  const SCRIPT = 'xnet://xnet.fyi/Script@1.0.0'
  const candidates = [option(TODO), option(ROOM), option(PLUGIN), option(SCRIPT)]

  it('drops registry entries with no rows (import side-effect schemas)', () => {
    const counts = new Map([
      [TODO, 3],
      [ROOM, 1],
      [PLUGIN, 0],
      [SCRIPT, 0]
    ])
    const result = selectInUseSchemaOptions(candidates, counts, new Set(), null)
    expect(result.map((o) => o.iri)).toEqual([TODO, ROOM])
  })

  it('keeps a schema observed in the current results even before its count lands', () => {
    const result = selectInUseSchemaOptions(candidates, new Map(), new Set([TODO]), null)
    expect(result.map((o) => o.iri)).toEqual([TODO])
  })

  it('keeps the current selection even when its last row was just deleted', () => {
    const counts = new Map([
      [TODO, 0],
      [ROOM, 2],
      [PLUGIN, 0],
      [SCRIPT, 0]
    ])
    const result = selectInUseSchemaOptions(candidates, counts, new Set(), TODO)
    expect(result.map((o) => o.iri)).toEqual([TODO, ROOM])
  })

  it('offers nothing from an empty store with no selection', () => {
    const counts = new Map([
      [PLUGIN, 0],
      [SCRIPT, 0]
    ])
    expect(selectInUseSchemaOptions(candidates, counts, new Set(), null)).toEqual([])
  })
})
