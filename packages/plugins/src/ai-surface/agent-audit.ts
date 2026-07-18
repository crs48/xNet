/**
 * Agent audit recorder + risk-tiered approval ceremony (exploration 0337).
 *
 * Wraps `AiSurfaceService.callTool` so every guarded tool call becomes an
 * `AgentAction` node (the semantic audit layer over the signed change log)
 * and medium+ risk calls go through an approval ceremony:
 *
 *   - `low` (and reads): execute immediately, record the action.
 *   - `medium`: park the call, return a pending payload with a one-time nonce
 *     the agent relays to the operator ("Reply APPROVE <nonce>"). The nonce is
 *     bound to one action, expires after a TTL (Slack-style staleness), and
 *     only its SHA-256 lands in the durable `AgentApproval` node. Chat
 *     approvals are relayed *by the agent* and therefore forgeable by a
 *     compromised gateway — which is exactly why this surface is capped at
 *     medium risk.
 *   - `high`/`critical`: park the call with **no nonce**. Chat cannot approve
 *     it; only `approveFromApp` — invoked from an xNet surface where the
 *     operator's own key signs the resulting `AgentApproval` node — releases
 *     it. The log then structurally proves the human was in the loop.
 *
 * Undo rides the existing rollback machinery: page-markdown applies return an
 * in-process `rollbackHandle`; `undo()` honors the action's declared
 * reversibility and executes the compensating rollback tool.
 */

import type { NodeStoreAPI } from '../services/local-api'
import type { AiRiskLevel, AiToolDefinition } from './types'
import {
  AGENT_ACTION_SCHEMA_IRI,
  AGENT_APPROVAL_SCHEMA_IRI,
  agentActionId,
  agentApprovalId,
  agentSessionId,
  AGENT_SESSION_SCHEMA_IRI,
  redactInstruction,
  type AgentApprovalSurface,
  type AgentReversibility
} from '@xnetjs/data'

export type AgentAuditSurface = {
  getTools(): AiToolDefinition[]
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>
}

export type AgentAuditContext = {
  /** The agent's DID (informational; the store identity does the signing). */
  agentDID: string
  /** Runtime session key (OpenClaw `agent:<id>:<mainKey>`, Hermes convo id…). */
  sessionKey: string
  /** Channel the session rides on (matches `AGENT_CHANNELS` ids). */
  channel?: string
  /** Channel peer id — recorded for approval forensics. */
  peer?: string
  /** Home Space node id for the audit records. */
  spaceId?: string
  /** Store instruction text as a redacted digest instead of verbatim. */
  redactInstructions?: boolean
}

export type AgentAuditRecorderConfig = {
  surface: AgentAuditSurface
  store: NodeStoreAPI
  context: AgentAuditContext
  /** Ceremony TTL in ms (default 5 minutes). */
  approvalTtlMs?: number
  clock?: () => number
  /** Nonce generator override (tests). */
  generateNonce?: () => string
}

export type AgentPendingApproval = {
  pending: true
  actionId: string
  risk: AiRiskLevel
  surface: AgentApprovalSurface
  /**
   * Present only for the chat tier: the one-time code the agent relays to the
   * operator. High/critical actions never carry a nonce — they are only
   * approvable from an xNet surface.
   */
  nonce?: string
  expiresAt: number
  message: string
}

export type AgentExecutedResult = {
  pending: false
  actionId: string
  result: unknown
}

export type AgentCallOutcome = AgentPendingApproval | AgentExecutedResult

type PendingEntry = {
  actionId: string
  name: string
  args: Record<string, unknown>
  risk: AiRiskLevel
  surface: AgentApprovalSurface
  nonceHash: string | null
  expiresAt: number
  reversibility: AgentReversibility
}

const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000

const NONCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const NONCE_LENGTH = 6

const defaultNonce = (): string => {
  const bytes = new Uint8Array(NONCE_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((b) => NONCE_ALPHABET[b % NONCE_ALPHABET.length]).join('')
}

export const hashNonce = async (nonce: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(nonce.trim().toUpperCase())
  )
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Tools whose apply is snapshot-reversible in-process. */
const REVERSIBLE_TOOLS = new Set(['xnet_apply_page_markdown'])
/** Tools whose effect needs a compensating mutation, not a snapshot restore. */
const COMPENSATABLE_TOOLS = new Set(['xnet_apply_database_mutation'])

export const reversibilityForTool = (name: string): AgentReversibility => {
  if (REVERSIBLE_TOOLS.has(name)) return 'reversible'
  if (COMPENSATABLE_TOOLS.has(name)) return 'compensatable'
  if (name.includes('delete') || name.includes('remove')) return 'irreversible'
  return 'compensatable'
}

/** Risk from the tool definition; unknown tools are treated as medium. */
export const riskForTool = (defs: AiToolDefinition[], name: string): AiRiskLevel =>
  defs.find((d) => d.name === name)?.risk ?? 'medium'

const surfaceForRisk = (risk: AiRiskLevel): AgentApprovalSurface =>
  risk === 'medium' ? 'chat' : 'app'

const extractChangeIds = (result: unknown): string[] => {
  if (!result || typeof result !== 'object') return []
  const record = result as Record<string, unknown>
  if (Array.isArray(record.appliedChangeIds)) {
    return record.appliedChangeIds.filter((id): id is string => typeof id === 'string')
  }
  return []
}

const extractRollbackHandle = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null
  const handle = (result as Record<string, unknown>).rollbackHandle
  return typeof handle === 'string' ? handle : null
}

export class AgentAuditRecorder {
  private readonly surface: AgentAuditSurface
  private readonly store: NodeStoreAPI
  private readonly context: AgentAuditContext
  private readonly ttlMs: number
  private readonly clock: () => number
  private readonly generateNonce: () => string

  readonly sessionId: string
  private seq = 0
  private sessionEnsured = false
  private readonly pending = new Map<string, PendingEntry>()
  private readonly rollbackHandles = new Map<string, string>()

  constructor(config: AgentAuditRecorderConfig) {
    this.surface = config.surface
    this.store = config.store
    this.context = config.context
    this.ttlMs = config.approvalTtlMs ?? DEFAULT_APPROVAL_TTL_MS
    this.clock = config.clock ?? (() => Date.now())
    this.generateNonce = config.generateNonce ?? defaultNonce
    this.sessionId = agentSessionId(config.context.agentDID, config.context.sessionKey)
  }

  /** Idempotently materialize the AgentSession node. */
  private async ensureSession(): Promise<void> {
    if (this.sessionEnsured) return
    this.sessionEnsured = true
    const existing = await this.store.get(this.sessionId)
    if (existing) return
    await this.createWithId(this.sessionId, AGENT_SESSION_SCHEMA_IRI, {
      space: this.context.spaceId,
      channel: this.context.channel ?? 'other',
      peer: this.context.peer,
      startedAt: this.clock()
    })
  }

  /** Create with a deterministic id — retries LWW-upsert instead of flooding. */
  private async createWithId(
    auditId: string,
    schemaId: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    const clean = Object.fromEntries(Object.entries(properties).filter(([, v]) => v !== undefined))
    const node = await this.store.create({ id: auditId, schemaId, properties: clean })
    return node.id
  }

  private async instructionText(instruction: string | undefined): Promise<string | undefined> {
    if (!instruction) return undefined
    if (!this.context.redactInstructions) return instruction
    const digest = await hashNonce(instruction)
    return redactInstruction(instruction, digest)
  }

  /** Sweep expired pending entries, marking their actions denied/expired. */
  async expireStale(): Promise<void> {
    const now = this.clock()
    for (const [actionId, entry] of [...this.pending]) {
      if (entry.expiresAt > now) continue
      this.pending.delete(actionId)
      await this.store.update(actionId, { properties: { status: 'denied' } })
      await this.recordApproval(entry, 'expired', {})
    }
  }

  /**
   * The audit + ceremony entry point. Returns either the executed result or a
   * pending-approval payload for the agent to relay.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    instruction?: string
  ): Promise<AgentCallOutcome> {
    await this.ensureSession()
    await this.expireStale()

    const risk = riskForTool(this.surface.getTools(), name)
    const reversibility = reversibilityForTool(name)
    const seq = ++this.seq
    const auditId = agentActionId(this.sessionId, seq)

    const baseProperties = {
      space: this.context.spaceId,
      session: this.sessionId,
      seq,
      tool: name,
      instruction: await this.instructionText(instruction),
      risk,
      reversibility
    }

    if (risk === 'low') {
      const actionId = await this.createWithId(auditId, AGENT_ACTION_SCHEMA_IRI, {
        ...baseProperties,
        status: 'proposed'
      })
      return await this.execute(actionId, name, args)
    }

    const surface = surfaceForRisk(risk)
    const expiresAt = this.clock() + this.ttlMs
    const nonce = surface === 'chat' ? this.generateNonce() : null
    const nonceHash = nonce ? await hashNonce(nonce) : null

    const actionId = await this.createWithId(auditId, AGENT_ACTION_SCHEMA_IRI, {
      ...baseProperties,
      status: 'pending-approval',
      approvalExpiresAt: expiresAt
    })

    this.pending.set(actionId, {
      actionId,
      name,
      args,
      risk,
      surface,
      nonceHash,
      expiresAt,
      reversibility
    })

    const message =
      surface === 'chat'
        ? `Risk ${risk}: reply APPROVE ${nonce} within ${Math.round(this.ttlMs / 60000)} minutes to run ${name}.`
        : `Risk ${risk}: ${name} cannot be approved over chat. Confirm in the xNet app.`

    return {
      pending: true,
      actionId,
      risk,
      surface,
      nonce: nonce ?? undefined,
      expiresAt,
      message
    }
  }

  /** Chat-tier approval: the operator replied `APPROVE <nonce>`. */
  async approveFromChat(nonce: string, peer?: string): Promise<AgentCallOutcome> {
    await this.expireStale()
    const digest = await hashNonce(nonce)
    const entry = [...this.pending.values()].find(
      (p) => p.surface === 'chat' && p.nonceHash === digest
    )
    if (!entry) {
      throw new Error('No pending chat approval matches that code (wrong or expired nonce)')
    }
    return await this.release(entry, 'chat', { peer, nonceHash: digest })
  }

  /**
   * App-tier approval for high/critical actions. Call this from an xNet
   * surface running as the operator, so the `AgentApproval` node is signed by
   * the operator's own identity — never expose it as an agent-callable tool.
   */
  async approveFromApp(actionId: string, approverDID: string): Promise<AgentCallOutcome> {
    await this.expireStale()
    const entry = this.pending.get(actionId)
    if (!entry) throw new Error(`No pending approval for action ${actionId}`)
    return await this.release(entry, entry.surface === 'chat' ? 'chat' : 'app', {
      approverDID
    })
  }

  /** Deny a pending action from any surface. */
  async deny(actionId: string, approverDID?: string): Promise<void> {
    const entry = this.pending.get(actionId)
    if (!entry) throw new Error(`No pending approval for action ${actionId}`)
    this.pending.delete(actionId)
    await this.store.update(actionId, { properties: { status: 'denied' } })
    await this.recordApproval(entry, 'denied', { approverDID })
  }

  /** Pending entries the agent may enumerate (never includes nonces). */
  listPending(): Array<Pick<PendingEntry, 'actionId' | 'name' | 'risk' | 'surface' | 'expiresAt'>> {
    return [...this.pending.values()].map(({ actionId, name, risk, surface, expiresAt }) => ({
      actionId,
      name,
      risk,
      surface,
      expiresAt
    }))
  }

  /**
   * Undo an applied action. Honors declared reversibility: `reversible`
   * actions restore via the rollback handle captured at apply time;
   * everything else refuses with a reason.
   */
  async undo(actionId: string): Promise<unknown> {
    const node = await this.store.get(actionId)
    if (!node) throw new Error(`Unknown agent action: ${actionId}`)
    const props = node.properties
    if (props.status !== 'applied') {
      throw new Error(`Action ${actionId} is not applied (status: ${String(props.status)})`)
    }
    if (props.reversibility !== 'reversible') {
      throw new Error(
        `Action ${actionId} is ${String(props.reversibility)} — no automatic undo; apply a compensating change instead`
      )
    }
    const handle = this.rollbackHandles.get(actionId)
    if (!handle) {
      throw new Error(
        `No rollback handle for ${actionId} (rollback snapshots live in-process; the serve process that applied it has gone away)`
      )
    }
    const result = await this.surface.callTool('xnet_rollback_page_markdown', {
      rollbackHandle: handle,
      confirmRollback: true
    })
    await this.store.update(actionId, { properties: { status: 'rolled-back' } })
    return result
  }

  private async release(
    entry: PendingEntry,
    surface: AgentApprovalSurface,
    meta: { peer?: string; approverDID?: string; nonceHash?: string }
  ): Promise<AgentCallOutcome> {
    this.pending.delete(entry.actionId)
    await this.recordApproval(entry, 'approved', meta, surface)
    await this.store.update(entry.actionId, { properties: { status: 'approved' } })
    return await this.execute(entry.actionId, entry.name, entry.args)
  }

  private async recordApproval(
    entry: PendingEntry,
    decision: 'approved' | 'denied' | 'expired',
    meta: { peer?: string; approverDID?: string; nonceHash?: string },
    surface: AgentApprovalSurface = entry.surface
  ): Promise<void> {
    await this.createWithId(agentApprovalId(entry.actionId), AGENT_APPROVAL_SCHEMA_IRI, {
      space: this.context.spaceId,
      action: entry.actionId,
      surface,
      decision,
      approverDID: meta.approverDID,
      nonceHash: meta.nonceHash ?? entry.nonceHash ?? undefined,
      peer: meta.peer ?? this.context.peer,
      decidedAt: this.clock()
    })
  }

  private async execute(
    actionId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<AgentExecutedResult> {
    try {
      const result = await this.surface.callTool(name, args)
      const handle = extractRollbackHandle(result)
      if (handle) this.rollbackHandles.set(actionId, handle)
      await this.store.update(actionId, {
        properties: { status: 'applied', changeIds: extractChangeIds(result) }
      })
      return { pending: false, actionId, result }
    } catch (err) {
      await this.store.update(actionId, {
        properties: {
          status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 2000) : String(err)
        }
      })
      throw err
    }
  }
}
