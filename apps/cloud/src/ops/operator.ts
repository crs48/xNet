/**
 * xNet Cloud — operator identity (exploration 0433, decision 4).
 *
 * Two different jobs, deliberately kept in two different places:
 *
 *  - **Authorisation** — *may this person act as an operator?* Answered by a
 *    WorkOS organisation role, which arrives as a **claim in the JWT**. That
 *    means the check is offline: no WorkOS API call sits on the request path, and
 *    disabling someone in WorkOS revokes ops access on their next token.
 *  - **Attribution** — *which signing key is theirs?* Answered by a binding from
 *    WorkOS user to `did:key`, held here in the control plane's own store.
 *
 * Keeping them separate is what makes the audit trail non-repudiable without
 * putting cryptographic material in a vendor's mutable user metadata.
 *
 * The `/internal/*` shared secret is NOT an operator identity: it names nobody,
 * so it can authorise reads but never a mutation (decision 11).
 */

import type { DocStore } from '../stores/durable'

/** The WorkOS organisation role that grants operator access. */
export const OPERATOR_ROLE = 'operator'

/** Cookie name for an operator session — deliberately distinct from the tenant one. */
export const OPERATOR_COOKIE = 'xnet_cloud_operator'

/** A signed-in operator: who they are, and which key signs for them. */
export interface OperatorIdentity {
  /** WorkOS user id. */
  workosUserId: string
  email?: string
  /** Bound signing key. Absent until the operator completes a device-grant claim. */
  did?: string
}

/** The persisted WorkOS-user → `did:key` binding. */
export interface OperatorBinding {
  workosUserId: string
  did: string
  boundAtMs: number
  /** Set when the binding is retired, so history outlives the key (open question 2). */
  retiredAtMs?: number
}

/**
 * Roles as they arrive in a WorkOS access token. WorkOS emits a single `role` for
 * an organisation membership; some configurations carry a list. Accept both rather
 * than depending on which shape a given tenant's directory produces.
 */
export interface RoleClaims {
  role?: unknown
  roles?: unknown
}

/**
 * Whether a token's claims grant operator access.
 *
 * Deliberately strict about types: a claim that is not a string (or array of
 * strings) is NOT a role, it is malformed input, and must not authorise anything.
 */
export function hasOperatorRole(claims: RoleClaims | null | undefined): boolean {
  if (!claims) return false
  const single = typeof claims.role === 'string' ? [claims.role] : []
  const many = Array.isArray(claims.roles)
    ? claims.roles.filter((r): r is string => typeof r === 'string')
    : []
  return [...single, ...many].includes(OPERATOR_ROLE)
}

/** Persistent operator roster. Reads live in the control plane, so they work in an incident. */
export class OperatorRegistry {
  constructor(private readonly docs: DocStore<OperatorBinding>) {}

  /** The active binding for a WorkOS user, or null. Retired bindings never resolve. */
  async active(workosUserId: string): Promise<OperatorBinding | null> {
    const rec = await this.docs.get(workosUserId)
    if (!rec || rec.retiredAtMs !== undefined) return null
    return rec
  }

  /** Bind a signing key to an operator. Replaces any active binding for that user. */
  async bind(workosUserId: string, did: string, nowMs: number): Promise<OperatorBinding> {
    if (!did.startsWith('did:')) throw new Error(`Not a DID: ${did}`)
    const rec: OperatorBinding = { workosUserId, did, boundAtMs: nowMs }
    await this.docs.put(workosUserId, rec)
    return rec
  }

  /**
   * Retire a binding without deleting it.
   *
   * Audit entries are retained twelve months and reference the DID that signed
   * them, so a key must stay *resolvable* long after it stops being usable — a
   * deleted binding would leave a year of history signed by an unattributable key
   * (decision 15, open question 2).
   */
  async retire(workosUserId: string, nowMs: number): Promise<void> {
    const rec = await this.docs.get(workosUserId)
    if (!rec) return
    await this.docs.put(workosUserId, { ...rec, retiredAtMs: nowMs })
  }

  /** Resolve any binding — active or retired — for verifying historical entries. */
  async resolveHistorical(workosUserId: string): Promise<OperatorBinding | null> {
    return this.docs.get(workosUserId)
  }
}
