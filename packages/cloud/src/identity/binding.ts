/**
 * @xnetjs/cloud/identity — the two-identity binding.
 *
 * xNet Cloud deliberately keeps two identities (exploration 0174):
 *
 *  - **Billing identity** — custodial, recoverable (WorkOS AuthKit user / email / SSO).
 *    It owns the subscription and the provisioned hub.
 *  - **Data identity** — non-custodial, self-sovereign (`did:key` from a passkey).
 *    It owns the encrypted data; losing it may lose the *data*, never the account.
 *
 * The link is a single `TenantBinding`. Creating or re-binding it requires BOTH a
 * proven billing session AND a fresh DID challenge (dual proof), so neither half can
 * be moved by an attacker holding only one. Account *recovery* runs off the billing
 * identity alone — that is the whole point: you can always get your paid account and
 * hub back, then enroll a new data identity.
 */

/** A signed challenge proving control of a `did:key` data identity. */
export interface DidChallenge {
  did: string
  /** Server-issued nonce the device signed. */
  nonce: string
  /** Signature over the nonce by the device key. */
  signature: string
}

/**
 * Verifies a DID challenge. Injected so this package stays free of crypto/identity
 * deps; `apps/cloud` wires it to `@xnetjs/identity`/`@xnetjs/crypto`.
 */
export type DidChallengeVerifier = (challenge: DidChallenge) => Promise<boolean>

export interface TenantBinding {
  tenantId: string
  /** WorkOS user id (custodial billing identity). */
  billingUserId: string
  /** Bound data identity; empty string while a rebind is pending after recovery. */
  did: string
  createdAt: number
  /** Last time BOTH proofs were verified together. */
  verifiedAt: number
  /** True after `recoverPaidAccount` until a new DID is bound via `completeRebind`. */
  rebindPending: boolean
}

export interface BindingStore {
  get(tenantId: string): Promise<TenantBinding | null>
  findByBillingUser(billingUserId: string): Promise<TenantBinding | null>
  put(binding: TenantBinding): Promise<void>
}

/** Simple in-memory store for dev + tests. */
export class MemoryBindingStore implements BindingStore {
  private readonly byTenant = new Map<string, TenantBinding>()

  async get(tenantId: string): Promise<TenantBinding | null> {
    return this.byTenant.get(tenantId) ?? null
  }

  async findByBillingUser(billingUserId: string): Promise<TenantBinding | null> {
    for (const b of this.byTenant.values()) {
      if (b.billingUserId === billingUserId) return b
    }
    return null
  }

  async put(binding: TenantBinding): Promise<void> {
    this.byTenant.set(binding.tenantId, { ...binding })
  }
}

const now = (provided?: number): number => provided ?? Date.now()

export interface BindArgs {
  tenantId: string
  /** Proven by an authenticated billing session upstream (WorkOS). */
  billingUserId: string
  /** Fresh DID challenge for the data identity being bound. */
  challenge: DidChallenge
  /** Injectable clock for deterministic tests. */
  nowMs?: number
}

/**
 * Create (or replace) a binding. Dual proof: the caller must already have
 * authenticated the billing session (passes `billingUserId`) AND supply a DID
 * challenge that verifies. Throws if the challenge fails.
 */
export async function bindIdentities(
  store: BindingStore,
  verifyDid: DidChallengeVerifier,
  args: BindArgs
): Promise<TenantBinding> {
  if (!(await verifyDid(args.challenge))) {
    throw new Error('DID challenge failed; refusing to bind')
  }
  const existing = await store.get(args.tenantId)
  if (existing && existing.billingUserId !== args.billingUserId) {
    throw new Error('Tenant is already bound to a different billing account')
  }
  const ts = now(args.nowMs)
  const binding: TenantBinding = {
    tenantId: args.tenantId,
    billingUserId: args.billingUserId,
    did: args.challenge.did,
    createdAt: existing?.createdAt ?? ts,
    verifiedAt: ts,
    rebindPending: false
  }
  await store.put(binding)
  return binding
}

/**
 * Recover a paid account using the billing identity alone (the custodial side).
 * Marks the binding `rebindPending` and clears the data identity. The subscription
 * and provisioned hub are untouched; the user then enrolls a fresh data identity via
 * {@link completeRebind}. Billing recovery never recovers the old encrypted data.
 */
export async function recoverPaidAccount(
  store: BindingStore,
  args: { billingUserId: string; nowMs?: number }
): Promise<TenantBinding> {
  const binding = await store.findByBillingUser(args.billingUserId)
  if (!binding) throw new Error('No tenant bound to this billing account')
  const recovered: TenantBinding = {
    ...binding,
    did: '',
    rebindPending: true,
    verifiedAt: now(args.nowMs)
  }
  await store.put(recovered)
  return recovered
}

/**
 * Complete a recovery by binding a fresh data identity. Requires the same dual proof
 * as the original bind: a proven billing session plus a verifying DID challenge.
 */
export async function completeRebind(
  store: BindingStore,
  verifyDid: DidChallengeVerifier,
  args: BindArgs
): Promise<TenantBinding> {
  const binding = await store.get(args.tenantId)
  if (!binding) throw new Error('No binding to rebind')
  if (binding.billingUserId !== args.billingUserId) {
    throw new Error('Billing account does not own this tenant')
  }
  if (!binding.rebindPending) {
    throw new Error('Tenant is not awaiting a rebind')
  }
  if (!(await verifyDid(args.challenge))) {
    throw new Error('DID challenge failed; refusing to rebind')
  }
  const rebound: TenantBinding = {
    ...binding,
    did: args.challenge.did,
    rebindPending: false,
    verifiedAt: now(args.nowMs)
  }
  await store.put(rebound)
  return rebound
}
