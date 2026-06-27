/**
 * The shared adapter-conformance suite, run against the headless runtime itself.
 *
 * This is the framework-agnostic baseline from exploration 0237: it proves the
 * reactive data contract holds for `createXNetClient` + `liveQuery` with no UI
 * framework involved. A Vue/Svelte/Solid adapter reuses `runAdapterConformance`
 * and adds only a render-harness check — it does not re-test these semantics.
 */
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { runAdapterConformance, type ConformanceClientFactory } from './adapter-conformance'
import { createXNetClient, type XNetClient } from './client'

const makeClient: ConformanceClientFactory = (overrides) => {
  const keyPair = generateSigningKeyPair()
  return createXNetClient({
    nodeStorage: new MemoryNodeStorageAdapter(),
    authorDID: createDID(keyPair.publicKey) as DID,
    signingKey: keyPair.privateKey,
    ...overrides
  })
}

describe('runAdapterConformance', () => {
  it('passes for the headless runtime (the baseline every adapter binds to)', async () => {
    const result = await runAdapterConformance(makeClient)
    expect(result.passed).toBe(true)
    expect(result.checks.every((c) => c.passed)).toBe(true)
  })

  it('covers live-query, mutate, auth-denial, and lifecycle', async () => {
    const { checks } = await runAdapterConformance(makeClient)
    const names = checks.map((c) => c.name)
    expect(names).toEqual([
      'live-query:immediate-and-update',
      'live-query:stops-after-unsubscribe',
      'mutate:round-trips-via-fetch',
      'auth:permissive-by-default',
      'auth:denial-surfaces',
      'lifecycle:destroy-is-idempotent'
    ])
  })

  it('throws AdapterConformanceError when the contract is violated', async () => {
    // A client whose `create` is a no-op never updates the live query, which
    // breaks the live-update and round-trip checks.
    const noopCreate = (async () => ({})) as unknown as XNetClient['mutate']['create']
    const brokenClient: ConformanceClientFactory = async (overrides) => {
      const client = await makeClient(overrides)
      return { ...client, mutate: { ...client.mutate, create: noopCreate } }
    }
    await expect(runAdapterConformance(brokenClient)).rejects.toThrow(/adapter conformance failed/)
  })
})
