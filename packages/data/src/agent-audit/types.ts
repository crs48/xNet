/**
 * Agent audit bundle — the exportable, offline-verifiable record of what an
 * agent did (exploration 0416).
 *
 * The `AgentAction` nodes in the workspace are the *semantic* layer; the signed
 * change log is the *evidence*. A bundle carries both plus the passport that
 * authorised them, so a third party can answer "what did this agent do, and was
 * it allowed to?" without trusting the machine that produced the file.
 *
 * Deliberately a plain JSON shape rather than an `.xnetpack`: the whole point
 * is that a recipient can verify it with `@xnetjs/data` and nothing else. The
 * `.xnetpack` codec (0344) remains the right container for a *workspace*; this
 * is a receipt.
 */

import type { AgentReversibility, AgentRisk } from '../schema/schemas/agent'
import type { Change } from '@xnetjs/sync'

export const AGENT_AUDIT_BUNDLE_VERSION = 1 as const

/** The delegation under which every action in the bundle was taken. */
export type BundlePassport = {
  /** The agent's own `did:key` — the author of every change below. */
  agentDID: string
  /** The operator DID that delegated authority. */
  operatorDID: string
  /** The operator-signed, attenuated UCAN. */
  ucan: string
  /** Delegation expiry (epoch ms), mirrored from the UCAN for display. */
  expiresAt?: number
}

/** One guarded tool call, flattened from its `AgentAction` node. */
export type BundleAction = {
  id: string
  session: string
  tool: string
  risk: AgentRisk
  status: string
  reversibility: AgentReversibility
  /** Kernel change ids this action produced. */
  changeIds: string[]
  /** Verbatim or redacted instruction, as stored. */
  instruction?: string
  createdAt?: number
}

/** One ceremony decision, flattened from its `AgentApproval` node. */
export type BundleApproval = {
  id: string
  /** `AgentAction` id this decision gates. */
  actionId: string
  surface: string
  decision: string
  /**
   * DID that decided. For a high/critical action this MUST be the operator —
   * verification treats anything else as a forged approval.
   */
  approverDID?: string
  createdAt?: number
}

/**
 * A self-contained agent audit receipt.
 */
export type AgentAuditBundle = {
  version: typeof AGENT_AUDIT_BUNDLE_VERSION
  /** When the bundle was produced (epoch ms). Informational only. */
  exportedAt: number
  passport: BundlePassport
  actions: BundleAction[]
  approvals: BundleApproval[]
  /**
   * The signed changes referenced by `actions[].changeIds`. These are the
   * evidence; everything else in the bundle is an index into them.
   */
  changes: Change[]
}

/** Why a bundle failed to verify. Machine-readable so callers can branch. */
export type AuditVerifyCode =
  | 'passport-invalid'
  | 'passport-audience-mismatch'
  | 'change-missing'
  | 'change-hash-tampered'
  | 'change-signature-invalid'
  | 'change-wrong-author'
  | 'chain-broken'
  | 'approval-missing'
  | 'approval-not-operator-signed'
  | 'approval-denied'

export type AuditVerifyProblem = {
  code: AuditVerifyCode
  /** Human-readable, already includes the offending id. */
  message: string
  /** The action, change, or approval id the problem attaches to. */
  subject?: string
}

export type AuditVerifyReport = {
  ok: boolean
  problems: AuditVerifyProblem[]
  /** Counts for a one-line CLI summary. */
  checked: {
    actions: number
    changes: number
    approvals: number
    /** Actions whose risk required an operator-signed approval. */
    gatedActions: number
  }
}
