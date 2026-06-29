/**
 * @xnetjs/cloud/escrow — opt-in account-recovery escrow (exploration 0243, P3.1).
 *
 * The cloud's half of the privacy-preserving escrow: it stores a **KMS-wrapped** blob
 * that is itself the user's **PIN-encrypted** recovery key (the PIN factor lives in
 * `@xnetjs/identity` `escrow.ts`). The control plane only unwraps it for a **verified
 * WorkOS session**, and even then it hands back the still-PIN-encrypted envelope — so
 * the cloud can never read the user's data on its own. Escrow is absent unless the user
 * explicitly enables it, and a disable deletes the blob outright.
 *
 * `KmsWrapper` is injected so this package stays free of any cloud-SDK dependency
 * (`apps/cloud` wires GCP Cloud KMS in production; tests use a fake).
 */

/** Wraps/unwraps bytes under a cloud-held key (GCP Cloud KMS in prod). */
export interface KmsWrapper {
  wrap(plaintext: Uint8Array): Promise<Uint8Array>
  unwrap(ciphertext: Uint8Array): Promise<Uint8Array>
}

/** Per-tenant store of the KMS-wrapped escrow blob. */
export interface EscrowStore {
  get(tenantId: string): Promise<Uint8Array | null>
  put(tenantId: string, wrapped: Uint8Array): Promise<void>
  delete(tenantId: string): Promise<void>
}

/** In-memory store for dev + tests. */
export class MemoryEscrowStore implements EscrowStore {
  private readonly byTenant = new Map<string, Uint8Array>()
  async get(tenantId: string): Promise<Uint8Array | null> {
    return this.byTenant.get(tenantId) ?? null
  }
  async put(tenantId: string, wrapped: Uint8Array): Promise<void> {
    this.byTenant.set(tenantId, wrapped.slice())
  }
  async delete(tenantId: string): Promise<void> {
    this.byTenant.delete(tenantId)
  }
}

/**
 * A reversible XOR "KMS" for tests/dev ONLY — never for production, where the key must
 * live in a real KMS/HSM. Makes the store contents unreadable without the key, which is
 * all the unit tests need to assert.
 */
export class FakeKmsWrapper implements KmsWrapper {
  constructor(private readonly key: Uint8Array = new Uint8Array([0x5a])) {}
  private xor(input: Uint8Array): Uint8Array {
    const out = new Uint8Array(input.length)
    for (let i = 0; i < input.length; i++) out[i] = input[i] ^ this.key[i % this.key.length]
    return out
  }
  async wrap(plaintext: Uint8Array): Promise<Uint8Array> {
    return this.xor(plaintext)
  }
  async unwrap(ciphertext: Uint8Array): Promise<Uint8Array> {
    return this.xor(ciphertext)
  }
}

/**
 * Enable escrow for a tenant: KMS-wrap the user's PIN-encrypted envelope and store it.
 * The caller has already authenticated the user; the envelope is opaque to the cloud.
 */
export async function enableEscrow(
  store: EscrowStore,
  kms: KmsWrapper,
  args: { tenantId: string; envelope: Uint8Array }
): Promise<void> {
  await store.put(args.tenantId, await kms.wrap(args.envelope))
}

/** Disable escrow: delete the stored blob (so the cloud holds nothing). */
export async function disableEscrow(store: EscrowStore, tenantId: string): Promise<void> {
  await store.delete(tenantId)
}

/** Whether a tenant has escrow enabled. */
export async function hasEscrow(store: EscrowStore, tenantId: string): Promise<boolean> {
  return (await store.get(tenantId)) !== null
}

/**
 * Recover the PIN-encrypted envelope for a tenant. Requires a **verified WorkOS
 * session** (`sessionVerified`) — the control plane proves it before calling this.
 * Returns the still-PIN-encrypted envelope (the device opens it with the user's PIN),
 * or null if escrow was never enabled. Throws if the session isn't verified.
 */
export async function recoverEscrow(
  store: EscrowStore,
  kms: KmsWrapper,
  args: { tenantId: string; sessionVerified: boolean }
): Promise<Uint8Array | null> {
  if (!args.sessionVerified) {
    throw new Error('Escrow recovery requires a verified billing session')
  }
  const wrapped = await store.get(args.tenantId)
  if (!wrapped) return null
  return kms.unwrap(wrapped)
}
