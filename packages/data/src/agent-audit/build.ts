/**
 * Building an agent audit bundle (exploration 0416).
 *
 * Assembly is deliberately port-shaped rather than store-shaped: the caller
 * supplies "give me the actions", "give me the approvals", "give me these
 * changes". That keeps this module testable without a SQLite store, and lets a
 * hub build a bundle over its own storage index without going through the
 * client `NodeStore`.
 *
 * Export is free and unconditional by charter (§6, No ground rent — you can
 * export everything, verified, for free). Nothing here consults an
 * entitlement.
 */

import type { Change } from '@xnetjs/sync'
import {
  AGENT_AUDIT_BUNDLE_VERSION,
  type AgentAuditBundle,
  type BundleAction,
  type BundleApproval,
  type BundlePassport
} from './types'

/**
 * The reads a bundle needs. Implemented over a `NodeStore` in the app, over
 * the storage index in a hub.
 */
export type AgentAuditSource = {
  /** Actions authored under this passport, oldest first. */
  listActions(passportAgentDID: string): Promise<BundleAction[]> | BundleAction[]
  /** Approvals gating any of `actionIds`. */
  listApprovals(actionIds: string[]): Promise<BundleApproval[]> | BundleApproval[]
  /** The signed changes for `changeIds`. Missing ids are simply absent. */
  getChanges(changeIds: string[]): Promise<Change[]> | Change[]
}

export type BuildAgentAuditOptions = {
  passport: BundlePassport
  source: AgentAuditSource
  /** Clock injection so tests are deterministic. Defaults to `Date.now`. */
  now?: () => number
}

/**
 * Assemble a self-contained, verifiable audit bundle for one passport.
 *
 * The result is exactly what {@link verifyAgentAudit} consumes; a bundle that
 * fails its own verifier is a bug in the source, not in the format, so callers
 * are encouraged to verify immediately after building.
 */
export async function buildAgentAuditBundle(
  options: BuildAgentAuditOptions
): Promise<AgentAuditBundle> {
  const { passport, source, now = Date.now } = options

  const actions = await source.listActions(passport.agentDID)
  const actionIds = actions.map((a) => a.id)
  const approvals = actionIds.length > 0 ? await source.listApprovals(actionIds) : []

  // Deduplicate: a batched apply can name the same change from two actions.
  const changeIds = [...new Set(actions.flatMap((a) => a.changeIds ?? []))]
  const changes = changeIds.length > 0 ? await source.getChanges(changeIds) : []

  return {
    version: AGENT_AUDIT_BUNDLE_VERSION,
    exportedAt: now(),
    passport,
    actions,
    approvals,
    changes
  }
}

/**
 * Serialize a bundle to the on-disk JSON form.
 *
 * `Uint8Array` signatures do not survive `JSON.stringify` intact, so they are
 * encoded as base64. {@link parseAgentAuditBundle} is the exact inverse.
 */
export function serializeAgentAuditBundle(bundle: AgentAuditBundle): string {
  return JSON.stringify(
    {
      ...bundle,
      changes: bundle.changes.map((change) => ({
        ...change,
        signature: bytesToBase64(change.signature)
      }))
    },
    null,
    2
  )
}

/**
 * Parse a serialized bundle.
 *
 * @throws {Error} If the payload is not a bundle of a supported version — an
 * unreadable receipt must not masquerade as an empty one.
 */
export function parseAgentAuditBundle(json: string): AgentAuditBundle {
  const raw = JSON.parse(json) as Record<string, unknown>

  if (raw.version !== AGENT_AUDIT_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported agent audit bundle version ${String(raw.version)} (expected ${AGENT_AUDIT_BUNDLE_VERSION})`
    )
  }
  if (!raw.passport || typeof raw.passport !== 'object') {
    throw new Error('Agent audit bundle is missing its passport')
  }

  const changes = Array.isArray(raw.changes) ? raw.changes : []
  return {
    ...(raw as unknown as AgentAuditBundle),
    changes: changes.map((change) => {
      const record = change as Record<string, unknown> & { signature: string }
      return {
        ...record,
        signature: base64ToBytes(record.signature)
      } as Change
    })
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}
