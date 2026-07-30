/**
 * Tests for the diagnostics console bootstrap + hub drain (exploration 0341).
 *
 * Real NodeStore over the memory adapter (the debug-report-drain test's
 * harness). Covers: idempotent Space + saved-view bootstrap, the hub drain
 * paths, and that imported reports land in the Diagnostics Space.
 */

import {
  MemoryNodeStorageAdapter,
  NodeStore,
  SavedViewSchema,
  validateSavedViewDescriptor,
  type NodeStore as NodeStoreType
} from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { debugReportNodeId, type IngestRequest, type QuarantinedReport } from './debug-report-drain'
import {
  DIAGNOSTICS_SPACE_ID,
  DIAGNOSTICS_VIEW_IDS,
  ensureDiagnosticsConsole,
  importDebugReports
} from './diagnostics-console'

const DID = 'did:key:zoperator'

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

/** A fake HUB inbox: serves /diagnostics/pending and records /diagnostics/ack. */
const makeHub = (pending: QuarantinedReport[]) => {
  const acked: string[][] = []
  const request: IngestRequest = vi.fn(async (path, init) => {
    if (path === '/diagnostics/pending') return { reports: pending }
    if (path === '/diagnostics/ack') {
      const ids = (init?.body as { ids: string[] }).ids
      acked.push(ids)
      return { ok: true, acked: ids.length }
    }
    throw new Error(`unexpected path ${path}`)
  })
  return { request, acked }
}

describe('ensureDiagnosticsConsole', () => {
  let store: NodeStoreType

  beforeEach(() => {
    store = makeStore()
  })

  it('creates the Space and the three saved views with valid descriptors', async () => {
    await ensureDiagnosticsConsole(store, DID)

    const space = await store.get(DIAGNOSTICS_SPACE_ID)
    expect(space?.properties.name).toBe('Diagnostics')
    expect(space?.properties.owners).toEqual([DID])

    for (const viewId of Object.values(DIAGNOSTICS_VIEW_IDS)) {
      const view = await store.get(viewId)
      expect(view?.schemaId).toBe(SavedViewSchema.schema['@id'])
      const descriptor = JSON.parse(String(view?.properties.descriptor))
      expect(validateSavedViewDescriptor(descriptor).valid).toBe(true)
    }
  })

  it('is idempotent — a second run creates nothing new and keeps edits', async () => {
    await ensureDiagnosticsConsole(store, DID)
    // Simulate an operator rename; re-bootstrap must not clobber it.
    await store.update(DIAGNOSTICS_SPACE_ID, { properties: { name: 'Ops' } })
    await ensureDiagnosticsConsole(store, DID)
    expect((await store.get(DIAGNOSTICS_SPACE_ID))?.properties.name).toBe('Ops')
  })
})

describe('importDebugReports', () => {
  it('drains the HUB paths into the Diagnostics Space and acks', async () => {
    const store = makeStore()
    const { request, acked } = makeHub([report(), report({ id: 'dr_u_x', lane: 'user' })])

    const result = await importDebugReports(store, request, DID)
    expect(result.drained).toBe(2)
    expect(acked).toEqual([['dr_abc123', 'dr_u_x']])

    const node = await store.get(debugReportNodeId('dr_abc123'))
    expect(node?.properties.space).toBe(DIAGNOSTICS_SPACE_ID)
    expect(node?.properties.status).toBe('new')
  })
})
