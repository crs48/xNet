import {
  DebugReportSchema,
  MemoryNodeStorageAdapter,
  NodeStore,
  type NodeStore as NodeStoreType
} from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  debugReportNodeId,
  drainDebugReports,
  type IngestRequest,
  type QuarantinedReport
} from './debug-report-drain'

const SPACE = 'space-diagnostics'
const SCHEMA_ID = DebugReportSchema.schema['@id']

const makeStore = (): NodeStoreType => {
  const identity = generateIdentity()
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: identity.identity.did as `did:key:${string}`,
    signingKey: identity.privateKey
  })
}

const report = (over: Partial<QuarantinedReport> = {}): QuarantinedReport => ({
  id: 'dr_abc123',
  lane: 'auto',
  fingerprint: 'abc123',
  errorName: 'TypeError',
  message: 'boom',
  surface: 'web',
  release: '1.42.317',
  occurrences: 1,
  firstSeenMs: 1000,
  lastSeenMs: 1000,
  ...over
})

/** A fake ingest backed by an in-memory pending list; records ack calls. */
const makeIngest = (pending: QuarantinedReport[]) => {
  const acked: string[][] = []
  const request: IngestRequest = vi.fn(async (path, init) => {
    if (path === '/internal/diagnostics/reports') return { reports: pending }
    if (path === '/internal/diagnostics/ack') {
      const ids = (init?.body as { ids: string[] }).ids
      acked.push(ids)
      return { ok: true, acked: ids.length }
    }
    throw new Error(`unexpected path ${path}`)
  })
  return { request, acked }
}

describe('drainDebugReports', () => {
  let store: NodeStoreType

  beforeEach(() => {
    store = makeStore()
  })

  it('materializes a pending report as a debug-report node and acks it', async () => {
    const { request, acked } = makeIngest([report()])
    const result = await drainDebugReports(store, request, SPACE)

    expect(result.drained).toBe(1)
    expect(acked).toEqual([['dr_abc123']])

    const node = await store.get(debugReportNodeId('dr_abc123'))
    expect(node).not.toBeNull()
    expect(node!.properties).toMatchObject({
      space: SPACE,
      fingerprint: 'abc123',
      errorName: 'TypeError',
      occurrences: 1,
      status: 'new'
    })
  })

  it('LWW-upserts on re-drain (deterministic id) — one node, not two', async () => {
    await drainDebugReports(store, makeIngest([report({ occurrences: 1 })]).request, SPACE)
    await drainDebugReports(
      store,
      makeIngest([report({ occurrences: 4, lastSeenMs: 2000 })]).request,
      SPACE
    )

    const node = await store.get(debugReportNodeId('dr_abc123'))
    expect(node!.properties.occurrences).toBe(4)
    expect(node!.properties.lastSeen).toBe(2000)
  })

  it('preserves an operator-set status across a re-drain', async () => {
    const id = debugReportNodeId('dr_abc123')
    await drainDebugReports(store, makeIngest([report()]).request, SPACE)
    await store.update(id, { properties: { status: 'fixed' } })

    // A later occurrence re-drains: status must NOT be reset to 'new'.
    await drainDebugReports(store, makeIngest([report({ occurrences: 9 })]).request, SPACE)

    const node = await store.get(id)
    expect(node!.properties.status).toBe('fixed')
    expect(node!.properties.occurrences).toBe(9)
  })

  it('no-ops (and does not ack) when there is nothing pending', async () => {
    const { request, acked } = makeIngest([])
    const result = await drainDebugReports(store, request, SPACE)
    expect(result.drained).toBe(0)
    expect(acked).toEqual([])
  })

  it('writes the schema id and a deterministic node id', async () => {
    await drainDebugReports(store, makeIngest([report({ id: 'dr_u_xyz' })]).request, SPACE)
    const node = await store.get('debugreport_dr_u_xyz')
    expect(node).not.toBeNull()
    expect(node!.schemaId).toBe(SCHEMA_ID)
  })
})
