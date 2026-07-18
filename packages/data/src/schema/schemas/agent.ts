/**
 * Agent schema pack (exploration 0337) — external AI agents (OpenClaw, Hermes,
 * Claude Code, …) as first-class, scoped, auditable identities.
 *
 * The kernel already signs every change with `authorDID` and chains it per
 * author; these schemas aim that machinery at agents:
 *
 *   - `AgentPassport` — the enrollment record: the agent's own DID plus the
 *     operator-delegated, attenuated UCAN that scopes what it may touch. The
 *     agent signs with its own key, never the operator's.
 *   - `AgentSession` — one conversation context (a WhatsApp thread, a Telegram
 *     peer, a CLI run) grouping the actions taken within it.
 *   - `AgentAction` — one guarded tool call: the verbatim instruction, risk,
 *     lifecycle status, reversibility, and the kernel change ids it produced.
 *     The semantic layer over the raw signed change log.
 *   - `AgentApproval` — the ceremony record for a gated action. Stores only a
 *     **hash** of the approval nonce (the agent can read nodes; the nonce must
 *     never transit a context the model can read back). High-risk approvals
 *     are created by the operator's own signing identity, so the log
 *     structurally proves the human was in the loop.
 *   - `AgentNotification` — the hub→operator outbox. The agent polls this lane
 *     and relays entries over its messaging channels; no new transport.
 *
 * Ids are deterministic (`agentSessionId`, `agentActionId`, …) so retries
 * LWW-upsert one node instead of flooding — the DebugReport pattern (0315).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, date, json, number, relation, select, text } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const AGENT_PASSPORT_SCHEMA_IRI = 'xnet://xnet.fyi/AgentPassport@1.0.0' as const
export const AGENT_SESSION_SCHEMA_IRI = 'xnet://xnet.fyi/AgentSession@1.0.0' as const
export const AGENT_ACTION_SCHEMA_IRI = 'xnet://xnet.fyi/AgentAction@1.0.0' as const
export const AGENT_APPROVAL_SCHEMA_IRI = 'xnet://xnet.fyi/AgentApproval@1.0.0' as const
export const AGENT_NOTIFICATION_SCHEMA_IRI = 'xnet://xnet.fyi/AgentNotification@1.0.0' as const

/** Which runtime carries the passport. */
export const AGENT_RUNTIMES = [
  { id: 'openclaw', name: 'OpenClaw', color: 'orange' },
  { id: 'hermes', name: 'Hermes', color: 'purple' },
  { id: 'claude-code', name: 'Claude Code', color: 'blue' },
  { id: 'other', name: 'Other', color: 'gray' }
] as const

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number]['id']

const passportStatuses = [
  { id: 'active', name: 'Active', color: 'green' },
  { id: 'revoked', name: 'Revoked', color: 'red' },
  { id: 'expired', name: 'Expired', color: 'gray' }
] as const

export const AgentPassportSchema = defineSchema({
  name: 'AgentPassport',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Home Space for the operator's agent-audit workspace — drives access. */
    space: relation({}),
    /** The agent's own did:key. Every change it makes is signed by this DID. */
    agentDID: text({ required: true, maxLength: 256 }),
    /** The operator DID that delegated authority to the agent. */
    operatorDID: text({ required: true, maxLength: 256 }),
    displayName: text({ maxLength: 120 }),
    runtime: select({ options: AGENT_RUNTIMES, required: true, default: 'other' }),
    /** The operator-signed, attenuated UCAN delegated to `agentDID`. */
    ucan: text({ required: true, maxLength: 8192 }),
    /** Delegation expiry (epoch ms). Rotation is the near-term revocation. */
    expiresAt: date({}),
    status: select({ options: passportStatuses, required: true, default: 'active' }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization('space')
})

export type AgentPassport = InferNode<(typeof AgentPassportSchema)['_properties']>

/** Where a session (or an approval) happened. */
export const AGENT_CHANNELS = [
  { id: 'whatsapp', name: 'WhatsApp', color: 'green' },
  { id: 'telegram', name: 'Telegram', color: 'blue' },
  { id: 'signal', name: 'Signal', color: 'blue' },
  { id: 'imessage', name: 'iMessage', color: 'green' },
  { id: 'discord', name: 'Discord', color: 'purple' },
  { id: 'slack', name: 'Slack', color: 'purple' },
  { id: 'app', name: 'xNet app', color: 'orange' },
  { id: 'cli', name: 'CLI', color: 'gray' },
  { id: 'other', name: 'Other', color: 'gray' }
] as const

export type AgentChannel = (typeof AGENT_CHANNELS)[number]['id']

export const AgentSessionSchema = defineSchema({
  name: 'AgentSession',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    space: relation({}),
    /** AgentPassport node id. */
    passport: relation({}),
    channel: select({ options: AGENT_CHANNELS, required: true, default: 'other' }),
    /** Channel-specific peer id (chat/thread id) — forensics for approvals. */
    peer: text({ maxLength: 256 }),
    startedAt: date({}),
    lastActiveAt: date({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization('space')
})

export type AgentSession = InferNode<(typeof AgentSessionSchema)['_properties']>

export const AGENT_RISKS = [
  { id: 'low', name: 'Low', color: 'green' },
  { id: 'medium', name: 'Medium', color: 'yellow' },
  { id: 'high', name: 'High', color: 'orange' },
  { id: 'critical', name: 'Critical', color: 'red' }
] as const

export type AgentRisk = (typeof AGENT_RISKS)[number]['id']

export const AGENT_ACTION_STATUSES = [
  { id: 'proposed', name: 'Proposed', color: 'gray' },
  { id: 'pending-approval', name: 'Pending approval', color: 'yellow' },
  { id: 'approved', name: 'Approved', color: 'blue' },
  { id: 'denied', name: 'Denied', color: 'red' },
  { id: 'applied', name: 'Applied', color: 'green' },
  { id: 'rolled-back', name: 'Rolled back', color: 'purple' },
  { id: 'failed', name: 'Failed', color: 'red' }
] as const

export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number]['id']

/** Harvested from the Agent Receipts spec — declares undo-ability up front. */
export const AGENT_REVERSIBILITIES = [
  { id: 'reversible', name: 'Reversible', color: 'green' },
  { id: 'compensatable', name: 'Compensatable', color: 'yellow' },
  { id: 'irreversible', name: 'Irreversible', color: 'red' }
] as const

export type AgentReversibility = (typeof AGENT_REVERSIBILITIES)[number]['id']

export const AgentActionSchema = defineSchema({
  name: 'AgentAction',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    space: relation({}),
    /** AgentSession node id (deterministic; see `agentSessionId`). */
    session: text({ required: true, maxLength: 256 }),
    /** Monotonic sequence within the session — part of the deterministic id. */
    seq: number({ integer: true }),
    /** Tool name, e.g. `xnet_apply_page_markdown`. */
    tool: text({ required: true, maxLength: 120 }),
    /**
     * The operator's instruction, verbatim. Sensitive — keep the audit Space
     * tightly scoped, or store a redaction (see `redactInstruction`).
     */
    instruction: text({ maxLength: 4000 }),
    risk: select({ options: AGENT_RISKS, required: true, default: 'low' }),
    status: select({ options: AGENT_ACTION_STATUSES, required: true, default: 'proposed' }),
    reversibility: select({
      options: AGENT_REVERSIBILITIES,
      required: true,
      default: 'compensatable'
    }),
    /** Kernel change ids this action produced (links semantic → signed log). */
    changeIds: json<string[]>({}),
    /** Error message when `status` is `failed`. */
    error: text({ maxLength: 2000 }),
    /** Pending-approval expiry (epoch ms) — the ceremony TTL. */
    approvalExpiresAt: date({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization('space')
})

export type AgentAction = InferNode<(typeof AgentActionSchema)['_properties']>

export const AGENT_APPROVAL_SURFACES = [
  // Relayed by the agent itself — forgeable by a compromised gateway, so
  // chat-surface approvals are capped at medium risk by the ceremony.
  { id: 'chat', name: 'Chat', color: 'yellow' },
  // Confirmed in an xNet surface and signed by the operator's own DID.
  { id: 'app', name: 'xNet app', color: 'green' },
  { id: 'push', name: 'Push', color: 'green' }
] as const

export type AgentApprovalSurface = (typeof AGENT_APPROVAL_SURFACES)[number]['id']

export const AGENT_APPROVAL_DECISIONS = [
  { id: 'approved', name: 'Approved', color: 'green' },
  { id: 'denied', name: 'Denied', color: 'red' },
  { id: 'expired', name: 'Expired', color: 'gray' }
] as const

export type AgentApprovalDecision = (typeof AGENT_APPROVAL_DECISIONS)[number]['id']

export const AgentApprovalSchema = defineSchema({
  name: 'AgentApproval',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    space: relation({}),
    /** AgentAction node id this decision gates. */
    action: text({ required: true, maxLength: 256 }),
    surface: select({ options: AGENT_APPROVAL_SURFACES, required: true, default: 'chat' }),
    decision: select({ options: AGENT_APPROVAL_DECISIONS, required: true, default: 'expired' }),
    /**
     * DID that made the decision. For `surface: 'app'`/`'push'` this is the
     * operator (the node is signed by their key — unforgeable by the agent).
     */
    approverDID: text({ maxLength: 256 }),
    /** SHA-256 hex of the nonce — never the nonce itself. */
    nonceHash: text({ maxLength: 64 }),
    /** Channel peer that replied, for `surface: 'chat'` forensics. */
    peer: text({ maxLength: 256 }),
    decidedAt: date({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization('space')
})

export type AgentApproval = InferNode<(typeof AgentApprovalSchema)['_properties']>

export const AGENT_NOTIFICATION_KINDS = [
  { id: 'info', name: 'Info', color: 'blue' },
  { id: 'approval-request', name: 'Approval request', color: 'yellow' },
  { id: 'alert', name: 'Alert', color: 'red' },
  { id: 'report', name: 'Report', color: 'green' }
] as const

export type AgentNotificationKind = (typeof AGENT_NOTIFICATION_KINDS)[number]['id']

export const AGENT_NOTIFICATION_STATUSES = [
  { id: 'pending', name: 'Pending', color: 'yellow' },
  { id: 'delivered', name: 'Delivered', color: 'green' },
  { id: 'dismissed', name: 'Dismissed', color: 'gray' }
] as const

export type AgentNotificationStatus = (typeof AGENT_NOTIFICATION_STATUSES)[number]['id']

export const AgentNotificationSchema = defineSchema({
  name: 'AgentNotification',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    space: relation({}),
    kind: select({ options: AGENT_NOTIFICATION_KINDS, required: true, default: 'info' }),
    title: text({ required: true, maxLength: 200 }),
    body: text({ maxLength: 4000 }),
    /** Related AgentAction node id, when the notification concerns one. */
    action: text({ maxLength: 256 }),
    status: select({ options: AGENT_NOTIFICATION_STATUSES, required: true, default: 'pending' }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization('space')
})

export type AgentNotification = InferNode<(typeof AgentNotificationSchema)['_properties']>

// ─── Deterministic ids (LWW upsert on retry — the DebugReport pattern) ──────

const sanitizeIdPart = (value: string): string => value.replace(/[^a-zA-Z0-9:_-]/g, '_')

/** Passport id for an agent DID — one passport node per agent identity. */
export const agentPassportId = (agentDID: string): string =>
  `agent-passport:${sanitizeIdPart(agentDID)}`

/**
 * Session id from the agent DID and the runtime's own session key (OpenClaw's
 * `agent:<id>:<mainKey>`, a Hermes conversation id, …).
 */
export const agentSessionId = (agentDID: string, sessionKey: string): string =>
  `agent-session:${sanitizeIdPart(agentDID)}:${sanitizeIdPart(sessionKey)}`

/** Action id — session-scoped sequence keeps retries idempotent. */
export const agentActionId = (sessionId: string, seq: number): string =>
  `agent-action:${sanitizeIdPart(sessionId)}:${seq}`

/** One approval decision per action. */
export const agentApprovalId = (actionId: string): string =>
  `agent-approval:${sanitizeIdPart(actionId)}`

/** Notification id — callers pass a stable key (e.g. the action id or a digest). */
export const agentNotificationId = (key: string): string =>
  `agent-notification:${sanitizeIdPart(key)}`

/**
 * Redacted instruction for privacy-sensitive audit Spaces: keeps only length
 * and a stable digest so repeated instructions still correlate.
 */
export const redactInstruction = (instruction: string, digestHex: string): string =>
  `[redacted ${instruction.length} chars sha256:${digestHex.slice(0, 16)}]`
