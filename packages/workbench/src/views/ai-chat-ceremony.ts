/**
 * The in-chat approval ceremony (exploration 0394, Phase 2).
 *
 * Wires the panel's tool executor through the existing risk-tiered
 * `AgentAuditRecorder` (0337) so a write tool call becomes a *parked action*
 * the operator releases, with the audit trail (`AgentSession` / `AgentAction`
 * / `AgentApproval` nodes) landing in the same store the write would touch:
 *
 *   - reads (anything outside {@link WRITE_TOOL_NAMES}) bypass the recorder —
 *     they are already visible as chat activity, and auditing every search
 *     would flood the store with action nodes;
 *   - `low`-risk writes execute immediately but still leave an action node;
 *   - `medium` parks with a one-time code the operator replies with in chat
 *     (`APPROVE <code>`), riding the existing nonce machinery — only the
 *     code's SHA-256 persists;
 *   - `high`/`critical` refuse the chat path entirely: the card offers the
 *     deliberate in-app approval, recorded with the operator's DID.
 *
 * The model experiences the ceremony as a slow tool: `executeTool` resolves
 * only when the operator decides (or the TTL expires), so the turn continues
 * with the real result — or an honest denial — in the same run.
 */

import type {
  AiSurfaceService,
  AIToolCall,
  ApprovalResolution,
  NodeStoreAPI,
  ParkedApproval
} from '@xnetjs/plugins'
import { AgentAuditRecorder, createApprovalBroker } from '@xnetjs/plugins'
import { WRITE_TOOL_NAMES } from './ai-chat-write-tools'

const WRITE_SET = new Set<string>(WRITE_TOOL_NAMES)

/**
 * What the panel renders while an action waits on the operator.
 *
 * Structurally the shared {@link ParkedApproval} — the panel and the desktop's
 * global approvals layer render the same card from the same shape, whether the
 * action parked in this renderer or in the bridge's main-process recorder.
 */
export type CeremonyPending = ParkedApproval

export type CeremonyResolution = ApprovalResolution

export type ChatCeremonyConfig = {
  surface: AiSurfaceService
  store: NodeStoreAPI
  /** The operator's DID — stamped on app-tier approvals. */
  operatorDID: string
  /** Distinguishes this panel session in the audit trail (e.g. thread id). */
  sessionKey: string
  /** A new pending card should render. */
  onPending: (pending: CeremonyPending) => void
  /** A pending card resolved (approve/deny/expiry) — update or clear it. */
  onResolved: (actionId: string, resolution: CeremonyResolution) => void
  clock?: () => number
  approvalTtlMs?: number
}

export type ChatCeremony = {
  /** Drop-in `executeTool` for the runtime: reads pass through, writes park. */
  executeTool: (call: AIToolCall) => Promise<unknown>
  /**
   * Consume a composer line as a ceremony reply. Returns true when the text
   * was `APPROVE <code>` for a live pending action — the caller must then NOT
   * send the line to the model. Unknown or expired codes return false and the
   * line flows to the model like any other message.
   */
  tryApproveFromChat(text: string): Promise<boolean>
  /** The deliberate in-app approval for `app`-surface (high/critical) cards. */
  approveFromApp(actionId: string): Promise<boolean>
  /** Deny any pending card. */
  deny(actionId: string): Promise<boolean>
  /** Pending cards, oldest first (for re-rendering). */
  listPending(): CeremonyPending[]
  /** Cancel timers; resolves all waiters as expired. */
  dispose(): void
}

const APPROVE_REPLY = /^\s*APPROVE\s+([A-Z0-9]{4,12})\s*$/i

export function createChatCeremony(config: ChatCeremonyConfig): ChatCeremony {
  const recorder = new AgentAuditRecorder({
    surface: config.surface,
    store: config.store,
    context: {
      // Informational: the store identity signs; this names the surface.
      agentDID: 'panel:assistant',
      sessionKey: config.sessionKey,
      channel: 'app'
    },
    ...(config.clock ? { clock: config.clock } : {}),
    ...(config.approvalTtlMs ? { approvalTtlMs: config.approvalTtlMs } : {})
  })
  // No `maxWaitMs`: the panel's runtime is in-process, so a parked call can
  // hold for the whole TTL without a transport timing out under it.
  const broker = createApprovalBroker(recorder, {
    ...(config.clock ? { clock: config.clock } : {}),
    onParked: config.onPending,
    onResolved: config.onResolved
  })

  return {
    async executeTool(call: AIToolCall): Promise<unknown> {
      const args = call.arguments ?? {}
      // Reads bypass the recorder entirely — auditing every search would
      // flood the store with action nodes for activity already visible in chat.
      if (!WRITE_SET.has(call.name)) {
        return await config.surface.callTool(call.name, args)
      }
      return await broker.callTool(call.name, args)
    },

    async tryApproveFromChat(text: string): Promise<boolean> {
      const match = APPROVE_REPLY.exec(text)
      if (!match) return false
      // An unknown or expired code is not a ceremony reply we can act on: the
      // caller sends the text to the model, which sees the failed attempt.
      return await broker.approveWithCode(match[1])
    },

    approveFromApp: (actionId: string) => broker.approve(actionId, config.operatorDID),

    deny: (actionId: string) => broker.deny(actionId, config.operatorDID),

    listPending: () => broker.listParked(),

    dispose: () => broker.dispose()
  }
}
