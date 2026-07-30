/**
 * Agent Passport (exploration 0337) — enroll an external agent (OpenClaw,
 * Hermes, Claude Code, …) as its own scoped identity.
 *
 * The passport is two things:
 *   1. a fresh `did:key` the agent signs with (its changes are attributable
 *      and tamper-evident via the kernel's per-author hash chain), and
 *   2. an operator-signed, attenuated UCAN delegating a narrow capability set
 *      to that DID — never the operator's key, never a wildcard.
 *
 * Revocation is expiry: passports default to a 7-day TTL and are re-minted on
 * rotation. Keep TTLs short — a stolen passport is live until it expires.
 */

import type { UCANCapability } from './types'
import { generateIdentity } from './did'
import { createUCAN, verifyUCAN, type VerifyResult } from './ucan'

/** Default passport TTL: 7 days (exploration 0337 — rotate weekly). */
export const AGENT_PASSPORT_DEFAULT_TTL_SECONDS = 7 * 24 * 3600

export type MintAgentPassportOptions = {
  /** Operator (delegating) identity. */
  operatorDID: string
  operatorKey: Uint8Array
  /**
   * Capabilities delegated to the agent. Must be narrow — per-space,
   * per-schema, per-action. Wildcards are rejected.
   */
  capabilities: UCANCapability[]
  /** Delegation lifetime in seconds (default: one week). */
  ttlSeconds?: number
  /** Parent UCANs when the operator's own authority is itself delegated. */
  proofs?: string[]
}

export type AgentPassportGrant = {
  /** The agent's new identity. Give the private key to `xnet mcp serve`, never to the gateway. */
  agentDID: string
  agentKey: Uint8Array
  /** Operator-signed delegation naming `agentDID` as audience. */
  ucan: string
  /** Expiry as epoch milliseconds (mirrors the UCAN's `exp`). */
  expiresAt: number
}

const isWildcard = (value: string): boolean => value === '*' || value === '**'

/**
 * Reject capability sets that fail attenuation discipline: an agent passport
 * must never carry `{with:'*'}` or `{can:'*'}` — that is exactly the 0307
 * wildcard weakness this feature exists to close.
 */
export function assertAttenuated(capabilities: UCANCapability[]): void {
  if (capabilities.length === 0) {
    throw new Error('Agent passport needs at least one capability')
  }
  for (const cap of capabilities) {
    if (isWildcard(cap.with) || isWildcard(cap.can)) {
      throw new Error(
        `Agent passport capability must be attenuated (got with=${cap.with} can=${cap.can})`
      )
    }
  }
}

/**
 * Generate an agent identity and delegate a scoped UCAN to it.
 */
export function mintAgentPassport(options: MintAgentPassportOptions): AgentPassportGrant {
  const { operatorDID, operatorKey, capabilities, proofs = [] } = options
  assertAttenuated(capabilities)

  const ttl = options.ttlSeconds ?? AGENT_PASSPORT_DEFAULT_TTL_SECONDS
  const expiration = Math.floor(Date.now() / 1000) + ttl
  const { identity, privateKey } = generateIdentity()

  const ucan = createUCAN({
    issuer: operatorDID,
    issuerKey: operatorKey,
    audience: identity.did,
    capabilities,
    expiration,
    proofs
  })

  return {
    agentDID: identity.did,
    agentKey: privateKey,
    ucan,
    expiresAt: expiration * 1000
  }
}

export type VerifyAgentPassportOptions = {
  /** Require the delegation audience to be this agent DID. */
  agentDID?: string
  /** Require the delegation issuer to be this operator DID. */
  operatorDID?: string
}

/**
 * Verify a passport UCAN: signature + chain via `verifyUCAN`, plus optional
 * audience/issuer pinning.
 */
export function verifyAgentPassport(
  token: string,
  options: VerifyAgentPassportOptions = {}
): VerifyResult {
  const result = verifyUCAN(token)
  if (!result.valid || !result.payload) return result

  if (options.agentDID && result.payload.aud !== options.agentDID) {
    return { valid: false, error: 'Passport audience does not match agent DID' }
  }
  if (options.operatorDID && result.payload.iss !== options.operatorDID) {
    return { valid: false, error: 'Passport issuer does not match operator DID' }
  }
  return result
}
