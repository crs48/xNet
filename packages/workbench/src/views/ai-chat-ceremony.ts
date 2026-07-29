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
  AgentCallOutcome,
  AgentPendingApproval,
  AiRiskLevel,
  AiSurfaceService,
  AIToolCall,
  NodeStoreAPI
} from '@xnetjs/plugins'
import { AgentAuditRecorder } from '@xnetjs/plugins'
import { WRITE_TOOL_NAMES } from './ai-chat-write-tools'

const WRITE_SET = new Set<string>(WRITE_TOOL_NAMES)

/** What the panel renders while an action waits on the operator. */
export type CeremonyPending = {
  actionId: string
  tool: string
  args: Record<string, unknown>
  risk: AiRiskLevel
  /** `chat` = medium (code reply releases it); `app` = high/critical. */
  surface: 'chat' | 'app'
  /** The recorder's ceremony message, rendered verbatim on the card. */
  message: string
  /** Present only on the chat tier — the code the operator replies with. */
  code?: string
  expiresAt: number
}

export type CeremonyResolution = 'approved' | 'denied' | 'expired'

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

type Waiter = {
  pending: CeremonyPending
  resolve: (toolResult: unknown) => void
  timer: ReturnType<typeof setTimeout>
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
  const clock = config.clock ?? (() => Date.now())
  const waiters = new Map<string, Waiter>()

  const settle = (actionId: string, resolution: CeremonyResolution, toolResult: unknown): void => {
    const waiter = waiters.get(actionId)
    if (!waiter) return
    waiters.delete(actionId)
    clearTimeout(waiter.timer)
    config.onResolved(actionId, resolution)
    waiter.resolve(toolResult)
  }

  const park = (outcome: AgentPendingApproval, args: Record<string, unknown>): Promise<unknown> => {
    const pending: CeremonyPending = {
      actionId: outcome.actionId,
      tool: nameOfPending(outcome),
      args,
      risk: outcome.risk,
      surface: outcome.surface === 'chat' ? 'chat' : 'app',
      message: outcome.message,
      ...(outcome.nonce ? { code: outcome.nonce } : {}),
      expiresAt: outcome.expiresAt
    }
    return new Promise<unknown>((resolve) => {
      const timer = setTimeout(
        () => {
          void recorder.expireStale().catch(() => undefined)
          settle(outcome.actionId, 'expired', {
            expired: true,
            message: 'The approval window expired before the operator decided. Nothing was applied.'
          })
        },
        Math.max(0, outcome.expiresAt - clock())
      )
      waiters.set(outcome.actionId, { pending, resolve, timer })
      config.onPending(pending)
    })
  }

  // The recorder keys pending entries by actionId; it does not echo the tool
  // name in the outcome, so carry it alongside via listPending().
  const nameOfPending = (outcome: AgentPendingApproval): string =>
    recorder.listPending().find((entry) => entry.actionId === outcome.actionId)?.name ?? 'tool'

  return {
    async executeTool(call: AIToolCall): Promise<unknown> {
      const args = call.arguments ?? {}
      if (!WRITE_SET.has(call.name)) {
        return await config.surface.callTool(call.name, args)
      }
      const outcome = await recorder.callTool(call.name, args)
      if (!outcome.pending) return outcome.result
      return await park(outcome, args)
    },

    async tryApproveFromChat(text: string): Promise<boolean> {
      const match = APPROVE_REPLY.exec(text)
      if (!match) return false
      let outcome: AgentCallOutcome
      try {
        outcome = await recorder.approveFromChat(match[1])
      } catch {
        // Wrong or expired code: not a ceremony reply we can act on. The
        // caller sends the text to the model, which sees the failed attempt.
        return false
      }
      if (!outcome.pending) settle(outcome.actionId, 'approved', outcome.result)
      return true
    },

    async approveFromApp(actionId: string): Promise<boolean> {
      if (!waiters.has(actionId)) return false
      const outcome = await recorder.approveFromApp(actionId, config.operatorDID)
      if (!outcome.pending) settle(actionId, 'approved', outcome.result)
      return true
    },

    async deny(actionId: string): Promise<boolean> {
      if (!waiters.has(actionId)) return false
      await recorder.deny(actionId, config.operatorDID)
      settle(actionId, 'denied', {
        denied: true,
        message: 'The operator denied this action. Nothing was applied.'
      })
      return true
    },

    listPending(): CeremonyPending[] {
      return [...waiters.values()].map((waiter) => waiter.pending)
    },

    dispose(): void {
      for (const [actionId] of [...waiters]) {
        settle(actionId, 'expired', {
          expired: true,
          message: 'The conversation was reset before the operator decided. Nothing was applied.'
        })
      }
    }
  }
}
