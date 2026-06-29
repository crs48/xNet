import { describe, expect, it } from 'vitest'
import {
  FakeKmsWrapper,
  MemoryEscrowStore,
  disableEscrow,
  enableEscrow,
  hasEscrow,
  recoverEscrow
} from './index'

const TENANT = 't_alice'
// The cloud treats the user's PIN-encrypted envelope as opaque bytes; its contents (and
// the PIN that opens it) live in @xnetjs/identity and are tested there. Here we only
// assert the cloud's guarantees: enable/disable, wrapped-at-rest, and session-gating.
const envelope = (): Uint8Array => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

describe('cloud escrow (privacy-preserving)', () => {
  it('is absent until explicitly enabled', async () => {
    const store = new MemoryEscrowStore()
    expect(await hasEscrow(store, TENANT)).toBe(false)
    await enableEscrow(store, new FakeKmsWrapper(), { tenantId: TENANT, envelope: envelope() })
    expect(await hasEscrow(store, TENANT)).toBe(true)
  })

  it('stores only the KMS-wrapped blob — never the plaintext envelope', async () => {
    const store = new MemoryEscrowStore()
    const env = envelope()
    await enableEscrow(store, new FakeKmsWrapper(), { tenantId: TENANT, envelope: env })
    const stored = await store.get(TENANT)
    expect(stored).not.toBeNull()
    expect(stored).not.toEqual(env) // wrapped, not the raw envelope
  })

  it('refuses recovery without a verified billing session', async () => {
    const store = new MemoryEscrowStore()
    const kms = new FakeKmsWrapper()
    await enableEscrow(store, kms, { tenantId: TENANT, envelope: envelope() })
    await expect(
      recoverEscrow(store, kms, { tenantId: TENANT, sessionVerified: false })
    ).rejects.toThrow(/verified billing session/)
  })

  it('returns the original envelope unchanged to a verified session', async () => {
    const store = new MemoryEscrowStore()
    const kms = new FakeKmsWrapper()
    const env = envelope()
    await enableEscrow(store, kms, { tenantId: TENANT, envelope: env })
    const recovered = await recoverEscrow(store, kms, { tenantId: TENANT, sessionVerified: true })
    // KMS-unwrap restores exactly what was sealed — still the PIN-encrypted envelope.
    expect(recovered).toEqual(env)
  })

  it('disable deletes the blob, and recovery then returns null', async () => {
    const store = new MemoryEscrowStore()
    const kms = new FakeKmsWrapper()
    await enableEscrow(store, kms, { tenantId: TENANT, envelope: envelope() })
    await disableEscrow(store, TENANT)
    expect(await hasEscrow(store, TENANT)).toBe(false)
    expect(await recoverEscrow(store, kms, { tenantId: TENANT, sessionVerified: true })).toBeNull()
  })
})
