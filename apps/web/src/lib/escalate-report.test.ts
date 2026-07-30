/**
 * Tests for per-report escalation (exploration 0341 P4): the composed payload
 * is allowlisted (workspace-only fields never leave), the send goes through
 * the hub forwarder path, and the node is stamped with the XR-… handle.
 */

import { DebugReportSchema, MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import type { IngestRequest } from './debug-report-drain'
import { composeEscalationPayload, escalateDebugReport } from './escalate-report'

const makeStore = () => {
  const identity = generateIdentity()
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: identity.identity.did as `did:key:${string}`,
    signingKey: identity.privateKey
  })
}

const PROPS = {
  space: 'space_diagnostics',
  lane: 'auto',
  fingerprint: 'abc',
  errorName: 'TypeError',
  message: 'boom',
  stack: 'at explode (app.js:1:2)',
  release: 'web-1.42',
  surface: 'web',
  status: 'new',
  occurrences: 3
}

describe('composeEscalationPayload', () => {
  it('allowlists diagnostic fields and drops workspace bookkeeping', () => {
    const payload = composeEscalationPayload(PROPS)
    expect(payload).toMatchObject({ lane: 'user', errorName: 'TypeError', message: 'boom' })
    const json = JSON.stringify(payload)
    // Node-side fields must never leave: space, status, fingerprint (recomputed
    // upstream), occurrences.
    expect(json).not.toContain('space_diagnostics')
    expect(json).not.toContain('"status"')
    expect(json).not.toContain('"fingerprint"')
  })

  it('returns null without an error name', () => {
    expect(composeEscalationPayload({ message: 'x' })).toBeNull()
  })
})

describe('escalateDebugReport', () => {
  it('POSTs the exact payload to the forwarder and stamps escalatedId', async () => {
    const store = makeStore()
    const node = await store.create({
      id: 'debugreport_dr_abc',
      schemaId: DebugReportSchema.schema['@id'],
      properties: PROPS
    })
    const payload = composeEscalationPayload(PROPS)!
    const request: IngestRequest = vi.fn(async (path, init) => {
      expect(path).toBe('/diagnostics/report')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(payload) // byte-for-byte: what was previewed is what is sent
      return { id: 'dr_u_x', shortId: 'XR-7F3A2B' }
    })

    const result = await escalateDebugReport(store, request, node.id, payload)
    expect(result.shortId).toBe('XR-7F3A2B')
    expect((await store.get(node.id))?.properties.escalatedId).toBe('XR-7F3A2B')
  })

  it('throws (and stamps nothing) when the hub rejects the forward', async () => {
    const store = makeStore()
    const node = await store.create({
      id: 'debugreport_dr_err',
      schemaId: DebugReportSchema.schema['@id'],
      properties: PROPS
    })
    const request: IngestRequest = async () => ({ error: 'diagnostics_unreachable' })
    await expect(
      escalateDebugReport(store, request, node.id, composeEscalationPayload(PROPS)!)
    ).rejects.toThrow('diagnostics_unreachable')
    expect((await store.get(node.id))?.properties.escalatedId).toBeUndefined()
  })
})
