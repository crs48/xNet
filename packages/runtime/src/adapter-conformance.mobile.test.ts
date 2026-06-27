/**
 * Mobile (in-webview host) target for the shared adapter-conformance suite —
 * exploration 0238.
 *
 * The mobile app reaches parity with web/Electron by hosting the *same* SPA in a
 * native webview and running the *same* `createXNetClient` runtime inside it — no
 * surfaces, storage, or sync re-implemented natively. This test makes that
 * guarantee executable: the client the mobile webview boots passes the identical
 * framework-agnostic data contract that the web baseline does.
 *
 * As in every conformance target, `MemoryNodeStorageAdapter` stands in for the
 * real backend (sqlite-wasm/OPFS in the webview) — the suite validates the
 * runtime contract, not the storage engine, which has its own tests.
 */
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { runAdapterConformance, type ConformanceClientFactory } from './adapter-conformance'
import { createXNetClient } from './client'

/** Build the client exactly as the in-webview mobile host does. */
const makeMobileClient: ConformanceClientFactory = (overrides) => {
  const keyPair = generateSigningKeyPair()
  return createXNetClient({
    nodeStorage: new MemoryNodeStorageAdapter(),
    authorDID: createDID(keyPair.publicKey) as DID,
    signingKey: keyPair.privateKey,
    // The webview uses the in-process main-thread bridge (no worker), the same
    // default the runtime constructs when no custom dataBridge is supplied.
    ...overrides
  })
}

describe('runAdapterConformance — mobile webview host (0238)', () => {
  it('the in-webview mobile client passes the same contract as web', async () => {
    const result = await runAdapterConformance(makeMobileClient)
    expect(result.passed).toBe(true)
    expect(result.checks.every((c) => c.passed)).toBe(true)
  })

  it('authorization denial still surfaces inside the mobile host', async () => {
    const { checks } = await runAdapterConformance(makeMobileClient)
    const denial = checks.find((c) => c.name === 'auth:denial-surfaces')
    expect(denial?.passed).toBe(true)
  })

  it('a recreated client (app resume) destroys idempotently', async () => {
    // Mobile apps tear down and rebuild the client across background/resume.
    const first = await makeMobileClient()
    await first.destroy()
    await first.destroy()
    const second = await makeMobileClient()
    expect(second.authorDID).toMatch(/^did:key:/)
    await second.destroy()
  })
})
