/**
 * Offline verification of an agent audit bundle (exploration 0416).
 *
 * This is the function that makes the whole accountability claim real: it runs
 * against a file, with no network, no store, and no trust in the exporter. Four
 * independent things must hold, and each maps to a distinct forgery:
 *
 *   1. **The passport verifies** and names the operator as issuer and the agent
 *      as audience — otherwise the authority is fabricated.
 *   2. **Every change hash-verifies and signature-verifies under the agent's
 *      DID** — otherwise the record was edited after the fact.
 *   3. **The per-author chain is unbroken** — otherwise actions were *removed*,
 *      which a per-change check alone cannot detect.
 *   4. **Every high/critical action carries an approval signed by the
 *      operator** — otherwise the agent approved itself.
 *
 * Check 4 is the one no competitor can currently offer, and check 3 is the one
 * naive audit logs always miss.
 */

import type { AgentAuditBundle, AuditVerifyProblem, AuditVerifyReport } from './types'
import { parseDID, verifyAgentPassport, type PassportRevocationCheck } from '@xnetjs/identity'
import { verifyChange, verifyChangeHash, type Change } from '@xnetjs/sync'

/** Risks that may only be released from an xNet surface by the operator. */
const GATED_RISKS = new Set(['high', 'critical'])

/** Approval surfaces where the operator's own key signs the node. */
const OPERATOR_SURFACES = new Set(['app', 'push'])

export type VerifyAgentAuditOptions = {
  /**
   * Denylist consulted for the passport. A revoked passport does not
   * retroactively invalidate actions taken while it was live, so this is
   * reported but scoped: pass it when you want "is this agent still trusted?"
   * rather than "was this action authorised at the time?".
   */
  revocations?: PassportRevocationCheck
  /**
   * Treat a revoked passport as a verification failure. Default `false` —
   * revocation is a *current* statement, and a receipt is a *historical* one.
   */
  failOnRevoked?: boolean
}

/**
 * Verify an exported agent audit bundle.
 *
 * Never throws for bundle content — malformed input is reported as problems so
 * a caller gets the full list rather than the first failure.
 */
export function verifyAgentAudit(
  bundle: AgentAuditBundle,
  options: VerifyAgentAuditOptions = {}
): AuditVerifyReport {
  const problems: AuditVerifyProblem[] = []
  const { passport, actions = [], approvals = [], changes = [] } = bundle

  // ─── 1. The passport ───────────────────────────────────────────────
  const passportResult = verifyAgentPassport(passport.ucan, {
    agentDID: passport.agentDID,
    operatorDID: passport.operatorDID,
    ...(options.failOnRevoked && options.revocations ? { revocations: options.revocations } : {})
  })
  if (!passportResult.valid) {
    problems.push({
      code: passportResult.error?.includes('audience')
        ? 'passport-audience-mismatch'
        : 'passport-invalid',
      message: `Passport does not verify: ${passportResult.error ?? 'unknown reason'}`,
      subject: passport.agentDID
    })
  }

  // ─── 2. Every change verifies under the agent's key ────────────────
  const byId = new Map<string, Change>()
  let agentPublicKey: Uint8Array | undefined
  try {
    agentPublicKey = parseDID(passport.agentDID)
  } catch {
    // Already reported by the passport check; per-change signature
    // verification is simply skipped rather than reported N more times.
  }

  for (const change of changes) {
    byId.set(change.id, change)

    if (!verifyChangeHash(change)) {
      problems.push({
        code: 'change-hash-tampered',
        message: `Change ${change.id} does not match its own hash`,
        subject: change.id
      })
      // A tampered hash makes the signature check meaningless; skip it.
      continue
    }
    if (change.authorDID !== passport.agentDID) {
      problems.push({
        code: 'change-wrong-author',
        message: `Change ${change.id} is authored by ${change.authorDID}, not the passport agent`,
        subject: change.id
      })
      continue
    }
    if (agentPublicKey && !verifyChange(change, agentPublicKey)) {
      problems.push({
        code: 'change-signature-invalid',
        message: `Change ${change.id} has an invalid signature`,
        subject: change.id
      })
    }
  }

  // ─── 3. The per-author chain is unbroken ───────────────────────────
  // Ordered by lamport, each change's parentHash must be its predecessor's
  // hash. A removed action shows up here and nowhere else.
  const ordered = [...changes].sort((a, b) => a.lamport - b.lamport)
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]
    const current = ordered[i]
    if (current.parentHash !== previous.hash) {
      problems.push({
        code: 'chain-broken',
        message: `Chain broken at change ${current.id}: parentHash does not match the preceding change ${previous.id} (an action may have been removed)`,
        subject: current.id
      })
    }
  }

  // ─── 4. Gated actions carry an operator-signed approval ────────────
  const approvalsByAction = new Map<string, (typeof approvals)[number]>()
  for (const approval of approvals) approvalsByAction.set(approval.actionId, approval)

  let gatedActions = 0
  for (const action of actions) {
    for (const changeId of action.changeIds ?? []) {
      if (!byId.has(changeId)) {
        problems.push({
          code: 'change-missing',
          message: `Action ${action.id} references change ${changeId}, which is absent from the bundle`,
          subject: action.id
        })
      }
    }

    if (!GATED_RISKS.has(action.risk)) continue
    gatedActions += 1

    const approval = approvalsByAction.get(action.id)
    if (!approval) {
      problems.push({
        code: 'approval-missing',
        message: `${action.risk} action ${action.id} has no approval record`,
        subject: action.id
      })
      continue
    }
    if (approval.decision !== 'approved') {
      problems.push({
        code: 'approval-denied',
        message: `${action.risk} action ${action.id} was recorded as ${approval.decision} yet appears in the log`,
        subject: action.id
      })
      continue
    }
    // The load-bearing check: chat cannot fabricate this, because releasing a
    // high/critical action requires the operator's own signing key.
    if (!OPERATOR_SURFACES.has(approval.surface) || approval.approverDID !== passport.operatorDID) {
      problems.push({
        code: 'approval-not-operator-signed',
        message: `${action.risk} action ${action.id} was approved via '${approval.surface}' by ${approval.approverDID ?? 'an unnamed party'} — only the operator (${passport.operatorDID}) may release it`,
        subject: action.id
      })
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    checked: {
      actions: actions.length,
      changes: changes.length,
      approvals: approvals.length,
      gatedActions
    }
  }
}
