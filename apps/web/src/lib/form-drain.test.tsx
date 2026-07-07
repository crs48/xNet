/**
 * Tests for the form submission drain core (exploration 0278): pending
 * submissions become rows with deterministic ids and provenance; drift
 * casualties are rejected on the hub, not dropped; double-drain converges.
 */

import { renderHook, waitFor } from '@testing-library/react'
import {
  DatabaseFieldSchema,
  DatabaseSchema,
  DatabaseViewSchema,
  MemoryNodeStorageAdapter,
  fromCellProperties,
  submissionRowId,
  type NodeStore
} from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useNodeStore } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { drainFormInboxes, type HubRequest } from './form-drain'

/** Real NodeStore via the provider harness (same pattern as useGridDatabase tests). */
async function createStore(): Promise<NodeStore> {
  const { identity, privateKey } = generateIdentity()
  const storage = new MemoryNodeStorageAdapter()
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <XNetProvider
        config={{
          nodeStorage: storage,
          authorDID: identity.did as never,
          signingKey: privateKey,
          disableSyncManager: true
        }}
      >
        {children}
      </XNetProvider>
    )
  }
  const { result } = renderHook(() => useNodeStore(), { wrapper: Wrapper })
  await waitFor(() => expect(result.current.isReady).toBe(true))
  return result.current.store!
}

/** Seed a database + name field + form view; returns the ids. */
async function seedFormDatabase(store: NodeStore) {
  const database = await store.create({
    schemaId: DatabaseSchema.schema['@id'],
    properties: { title: 'Tracker' }
  })
  const field = await store.create({
    schemaId: DatabaseFieldSchema.schema['@id'],
    properties: { database: database.id, name: 'Name', type: 'text', sortKey: 'a0', config: {} }
  })
  const view = await store.create({
    schemaId: DatabaseViewSchema.schema['@id'],
    properties: {
      database: database.id,
      name: 'Intake',
      type: 'form',
      sortKey: 'a0',
      formConfig: { questions: [{ fieldId: field.id, required: true }] }
    }
  })
  return { databaseId: database.id, fieldId: field.id, viewId: view.id }
}

/** Minimal in-memory hub speaking the form-inbox drain API. */
function fakeHub(form: { tokenHash: string; viewId: string; databaseId: string }) {
  const pending = new Map<
    string,
    { nonce: string; answers: Record<string, unknown>; receivedAt: number }
  >()
  const rejected = new Map<string, string[]>()
  const request: HubRequest = async (path, init) => {
    if (path === '/forms') {
      return {
        forms: [{ ...form, pending: pending.size, rejected: rejected.size }]
      }
    }
    if (path.endsWith('/submissions?status=pending')) {
      return { submissions: [...pending.values()] }
    }
    if (path.endsWith('/submissions/ack')) {
      for (const nonce of (init?.body as { nonces: string[] }).nonces) pending.delete(nonce)
      return { ok: true }
    }
    if (path.endsWith('/submissions/reject')) {
      const body = init?.body as { nonce: string; reasons: string[] }
      pending.delete(body.nonce)
      rejected.set(body.nonce, body.reasons)
      return { ok: true }
    }
    throw new Error(`Unexpected hub path: ${path}`)
  }
  return { request, pending, rejected }
}

describe('drainFormInboxes', () => {
  it('materializes valid submissions as rows with deterministic ids + provenance, then acks', async () => {
    const store = await createStore()
    const { databaseId, fieldId, viewId } = await seedFormDatabase(store)
    const hub = fakeHub({ tokenHash: 'tok-hash-1', viewId, databaseId })
    hub.pending.set('n-1', { nonce: 'n-1', answers: { [fieldId]: 'Ada' }, receivedAt: 111 })

    const result = await drainFormInboxes(store, hub.request)

    expect(result).toEqual({ pendingTotal: 0, rejectedTotal: 0 })
    expect(hub.pending.size).toBe(0)

    const rowId = await submissionRowId('tok-hash-1', 'n-1')
    const row = await store.get(rowId)
    expect(row).toBeTruthy()
    expect(fromCellProperties(row!.properties)[fieldId]).toBe('Ada')
    expect(row!.properties.submissionMeta).toEqual({
      via: 'form',
      viewId,
      nonce: 'n-1',
      submittedAt: 111
    })
  })

  it('is idempotent: draining the same submission twice yields exactly one row', async () => {
    const store = await createStore()
    const { databaseId, fieldId, viewId } = await seedFormDatabase(store)
    const hub = fakeHub({ tokenHash: 'tok-hash-2', viewId, databaseId })

    hub.pending.set('n-dup', { nonce: 'n-dup', answers: { [fieldId]: 'Ada' }, receivedAt: 1 })
    await drainFormInboxes(store, hub.request)
    // Ack lost / another device re-drains the same nonce:
    hub.pending.set('n-dup', { nonce: 'n-dup', answers: { [fieldId]: 'Ada' }, receivedAt: 1 })
    await drainFormInboxes(store, hub.request)

    const rowId = await submissionRowId('tok-hash-2', 'n-dup')
    expect(await store.get(rowId)).toBeTruthy()
    const rows = await store.query({
      schemaId: 'xnet://xnet.fyi/DatabaseRow@2.0.0',
      options: { where: { database: databaseId } }
    } as never)
    expect((rows as { nodes: unknown[] }).nodes).toHaveLength(1)
  })

  it('rejects submissions that no longer validate instead of dropping them', async () => {
    const store = await createStore()
    const { databaseId, viewId } = await seedFormDatabase(store)
    const hub = fakeHub({ tokenHash: 'tok-hash-3', viewId, databaseId })
    // Answer for a field that was never asked/never existed + missing required.
    hub.pending.set('n-bad', {
      nonce: 'n-bad',
      answers: { 'deleted-field': 'stale' },
      receivedAt: 2
    })

    const result = await drainFormInboxes(store, hub.request)

    expect(hub.rejected.has('n-bad')).toBe(true)
    expect(hub.rejected.get('n-bad')!.join(',')).toContain('required')
    expect(result.rejectedTotal).toBeGreaterThan(0)
  })
})
