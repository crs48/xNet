import type { LabStore } from '../host'
import { describe, expect, it } from 'vitest'
import { LabPermissionError, bridgeToGlobal, createLabHostBridge, isSchemaReadable } from '../host'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'
const PAGE = 'xnet://xnet.fyi/Page@1.0.0'

function fakeStore(): LabStore {
  const nodes = [
    { id: 'n1', schemaId: TASK, properties: { title: 'A' } },
    { id: 'n2', schemaId: PAGE, properties: { title: 'B' } }
  ]
  return {
    list: async ({ schemaId, limit, offset }) => {
      let rows = nodes.filter((n) => !schemaId || n.schemaId === schemaId)
      if (offset) rows = rows.slice(offset)
      if (limit) rows = rows.slice(0, limit)
      return rows
    },
    get: async (id) => nodes.find((n) => n.id === id) ?? null
  }
}

describe('isSchemaReadable', () => {
  it('honors wildcard and explicit grants', () => {
    expect(isSchemaReadable({ schemas: { read: '*' } }, TASK)).toBe(true)
    expect(isSchemaReadable({ schemas: { read: [TASK] } }, TASK)).toBe(true)
    expect(isSchemaReadable({ schemas: { read: [PAGE] } }, TASK)).toBe(false)
    expect(isSchemaReadable(undefined, TASK)).toBe(false)
  })
})

describe('createLabHostBridge', () => {
  it('queries readable schemas', async () => {
    const bridge = createLabHostBridge({
      store: fakeStore(),
      permissions: { schemas: { read: [TASK] } }
    })
    const rows = (await bridge.get('query')!.invoke({ schema: TASK })) as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('rejects queries to schemas outside the read grant', async () => {
    const bridge = createLabHostBridge({
      store: fakeStore(),
      permissions: { schemas: { read: [TASK] } }
    })
    await expect(bridge.get('query')!.invoke({ schema: PAGE })).rejects.toBeInstanceOf(
      LabPermissionError
    )
  })

  it('re-checks read permission for get() against the resolved schema', async () => {
    const bridge = createLabHostBridge({
      store: fakeStore(),
      permissions: { schemas: { read: [TASK] } }
    })
    const allowed = await bridge.get('get')!.invoke({ id: 'n1' })
    expect(allowed).toMatchObject({ id: 'n1' })
    await expect(bridge.get('get')!.invoke({ id: 'n2' })).rejects.toBeInstanceOf(LabPermissionError)
  })

  it('exposes tools as a bound global object', () => {
    const bridge = createLabHostBridge({
      store: fakeStore(),
      permissions: { schemas: { read: '*' } }
    })
    const api = bridgeToGlobal(bridge)
    expect(typeof api.query).toBe('function')
    expect(typeof api.get).toBe('function')
  })
})
