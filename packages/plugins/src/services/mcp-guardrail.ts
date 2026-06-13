/**
 * Write guardrail for the MCP server (exploration 0175, "boundary hardening").
 *
 * The 0175 pitch is that xNet's guardrail makes an autonomous agent safe to
 * point at a workspace. But the generic `xnet_create/update/delete` tools used
 * to mutate the store directly, bypassing the mutation-plan guardrail that the
 * page/database tools enforce. This closes that gap for *every* MCP client
 * (OpenClaw, Claude Code, …) at the boundary, independent of the client's own
 * (often weak) safety model:
 *
 * - **Risk classification.** Deletes are `high`; creating an outward-facing node
 *   (e.g. a chat message — "sending") is `high`; ordinary creates/updates are
 *   `low`.
 * - **Confirmation gate.** `high`/`critical` and outward-facing writes return
 *   `needs-confirmation` instead of mutating, until the caller re-issues with
 *   `confirm: true` (after the human approves — see the ClawHub skill).
 * - **Cost budget.** Writes are charged against a per-surface budget
 *   (`@xnetjs/abuse`); a runaway agent is throttled, not unbounded.
 * - **Provenance + audit.** Applied writes are recorded with their risk and an
 *   optional AI-provenance evidence ref, queryable for review.
 */

import type { AiRiskLevel } from '../ai-surface'
import {
  createAISignalProvenanceEvidenceRef,
  evaluatePublicWriteBudget,
  type AISignalProvenanceInput,
  type AbuseSurface,
  type PublicWriteBudgetPolicy,
  type PublicWriteBudgetUsage
} from '@xnetjs/abuse'

export type McpWriteKind = 'create' | 'update' | 'delete'

export interface McpWriteRequest {
  kind: McpWriteKind
  /** Schema IRI (for create). Used to detect outward-facing writes. */
  schemaId?: string
  /** Target node id (for update/delete). */
  nodeId?: string
  /** Caller confirmation; required to apply high-risk / outward-facing writes. */
  confirm?: boolean
  /** Optional provenance from the calling agent (model that authored the write). */
  provenance?: AISignalProvenanceInput
}

export type McpWriteVerdict =
  | { decision: 'allow'; risk: AiRiskLevel; outwardFacing: boolean; provenanceRef: string | null }
  | { decision: 'needs-confirmation'; risk: AiRiskLevel; outwardFacing: boolean; reason: string }
  | { decision: 'blocked'; risk: AiRiskLevel; reason: string }

export interface McpWriteAuditEvent {
  kind: McpWriteKind
  risk: AiRiskLevel
  outwardFacing: boolean
  schemaId?: string
  nodeId?: string
  provenanceRef?: string
  at: number
}

export interface McpWriteGuardrailOptions {
  /** Schema IRIs whose creation is outward-facing (raises risk, requires confirm). */
  outwardFacingSchemas?: readonly string[]
  /** Cost budget policy. Defaults to 120 writes / 60s on the surface. */
  budgetPolicy?: PublicWriteBudgetPolicy
  /** Abuse surface for budget keys. Defaults to `localApi`. */
  surface?: AbuseSurface
  /** Injectable clock (ms). Defaults to `Date.now`. */
  clock?: () => number
}

/** Chat messages are "sent" — creating one is an outward-facing action. */
export const DEFAULT_OUTWARD_FACING_SCHEMAS: readonly string[] = [
  'xnet://xnet.fyi/ChatMessage@1.0.0'
]

const DEFAULT_BUDGET_POLICY: PublicWriteBudgetPolicy = {
  limits: [{ scope: 'surface', unitsPerWindow: 120, windowMs: 60_000 }],
  defaultCostUnits: 1
}

export class McpWriteGuardrail {
  private readonly outward: Set<string>
  private readonly policy: PublicWriteBudgetPolicy
  private readonly surface: AbuseSurface
  private readonly now: () => number
  private usage: PublicWriteBudgetUsage[] = []
  private auditLog: McpWriteAuditEvent[] = []

  constructor(options: McpWriteGuardrailOptions = {}) {
    this.outward = new Set(options.outwardFacingSchemas ?? DEFAULT_OUTWARD_FACING_SCHEMAS)
    this.policy = options.budgetPolicy ?? DEFAULT_BUDGET_POLICY
    this.surface = options.surface ?? 'localApi'
    this.now = options.clock ?? (() => Date.now())
  }

  /** Classify and gate a write. Does not mutate anything; charges budget only on `allow`. */
  evaluate(req: McpWriteRequest): McpWriteVerdict {
    const { risk, outwardFacing } = this.classify(req)

    const budget = evaluatePublicWriteBudget(
      { surface: this.surface, now: this.now() },
      this.policy,
      this.usage
    )
    if (!budget.allowed) {
      return {
        decision: 'blocked',
        risk,
        reason: `write budget exceeded: ${budget.reasons.join(', ')}`
      }
    }

    const needsConfirmation = risk === 'high' || risk === 'critical' || outwardFacing
    if (needsConfirmation && req.confirm !== true) {
      return {
        decision: 'needs-confirmation',
        risk,
        outwardFacing,
        reason: outwardFacing
          ? 'Outward-facing write requires explicit confirmation (re-call with confirm: true after the user approves).'
          : `${risk}-risk write requires explicit confirmation (re-call with confirm: true after the user approves).`
      }
    }

    // Allowed: commit the budget charge.
    this.usage = budget.nextUsage
    const provenanceRef = req.provenance
      ? createAISignalProvenanceEvidenceRef(req.provenance)
      : null
    return { decision: 'allow', risk, outwardFacing, provenanceRef }
  }

  /** Record an applied write for audit/rollback review. Returns the event. */
  recordApplied(
    req: McpWriteRequest,
    verdict: Extract<McpWriteVerdict, { decision: 'allow' }>,
    nodeId?: string
  ): McpWriteAuditEvent {
    const event: McpWriteAuditEvent = {
      kind: req.kind,
      risk: verdict.risk,
      outwardFacing: verdict.outwardFacing,
      ...(req.schemaId ? { schemaId: req.schemaId } : {}),
      ...((nodeId ?? req.nodeId) ? { nodeId: nodeId ?? req.nodeId } : {}),
      ...(verdict.provenanceRef ? { provenanceRef: verdict.provenanceRef } : {}),
      at: this.now()
    }
    this.auditLog = [...this.auditLog, event].slice(-500)
    return event
  }

  getAuditLog(limit = 50): McpWriteAuditEvent[] {
    return this.auditLog.slice(-limit)
  }

  private classify(req: McpWriteRequest): { risk: AiRiskLevel; outwardFacing: boolean } {
    if (req.kind === 'delete') return { risk: 'high', outwardFacing: false }
    const outwardFacing = !!req.schemaId && this.outward.has(req.schemaId)
    if (outwardFacing) return { risk: 'high', outwardFacing: true }
    return { risk: 'low', outwardFacing: false }
  }
}

export function createMcpWriteGuardrail(options?: McpWriteGuardrailOptions): McpWriteGuardrail {
  return new McpWriteGuardrail(options)
}
