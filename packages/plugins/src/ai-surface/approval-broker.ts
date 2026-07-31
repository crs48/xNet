/**
 * The headless half of the approval ceremony (0337 / 0394 Phase 2, fixing 0414).
 *
 * {@link AgentAuditRecorder} decides *whether* a call needs a human; it does
 * not hold the call open while one is found. Every surface that wants "the
 * tool waits for the operator" therefore has to park the promise itself — and
 * the in-panel ceremony was the only one that did. A high-risk write from a
 * bridged agent parked in the main-process recorder, where no UI could reach
 * `approveFromApp`, and expired silently five minutes later.
 *
 * This module is the missing shared piece: park/settle plus a change
 * subscription, over any recorder, with no React and no transport. The panel
 * ceremony adapts it (`ai-chat-ceremony.ts`); the MCP server owns one so the
 * desktop can project its parked actions into the shell.
 *
 * Waiting is bounded separately from approving. `maxWaitMs` gives up on the
 * *wait* — the action stays parked and approvable until its real TTL — so a
 * transport with a request timeout (the MCP HTTP hop) gets an honest "still
 * pending" answer instead of a socket held open for five minutes.
 */

import type { AgentAuditRecorder, AgentPendingApproval } from './agent-audit'
import type { AiRiskLevel } from './types'

/** A call waiting on the operator, as any surface needs to render it. */
export type ParkedApproval = {
  actionId: string
  /** The tool the agent asked for. */
  tool: string
  args: Record<string, unknown>
  risk: AiRiskLevel
  /** `chat` = medium (a code releases it); `app` = high/critical. */
  surface: 'chat' | 'app'
  /** The recorder's ceremony message, rendered verbatim. */
  message: string
  /** Present only on the chat tier — the code the operator replies with. */
  code?: string
  expiresAt: number
}

/**
 * `failed` is distinct from `denied`: the operator said yes and the tool then
 * threw. Collapsing the two would tell the audit reader a human refused
 * something they actually approved.
 */
export type ApprovalResolution = 'approved' | 'denied' | 'expired' | 'failed'

export type ApprovalBrokerOptions = {
  clock?: () => number
  /**
   * How long {@link ApprovalBroker.callTool} holds its promise before
   * answering "still pending". Defaults to no bound (wait the full TTL), which
   * is right for an in-process caller. Transports with a request timeout pass
   * something shorter than that timeout.
   */
  maxWaitMs?: number
  /** A new action parked. */
  onParked?: (parked: ParkedApproval) => void
  /** A parked action resolved — approve, deny, or expiry. */
  onResolved?: (actionId: string, resolution: ApprovalResolution) => void
}

export type ApprovalBroker = {
  /**
   * Audit + ceremony wrapper around a tool call. Low-risk calls execute and
   * return their result; medium+ park and resolve when the operator decides.
   */
  callTool(name: string, args?: Record<string, unknown>, instruction?: string): Promise<unknown>
  /** Release a parked action from an xNet surface, stamped with the operator's DID. */
  approve(actionId: string, approverDID: string): Promise<boolean>
  /**
   * Release a chat-tier action by its one-time code. Returns false when no live
   * parked action matches — the caller then treats the text as an ordinary
   * message rather than a ceremony reply.
   */
  approveWithCode(code: string, peer?: string): Promise<boolean>
  deny(actionId: string, approverDID?: string): Promise<boolean>
  /** Parked actions, oldest first. */
  listParked(): ParkedApproval[]
  /** Fires whenever {@link listParked} would return something different. */
  subscribe(listener: (parked: ParkedApproval[]) => void): () => void
  /** Resolve every waiter as expired and drop timers. */
  dispose(): void
}

/** What a caller gets back when the wait — not the approval — ran out. */
const stillPendingResult = (parked: ParkedApproval): Record<string, unknown> => ({
  pending: true,
  actionId: parked.actionId,
  risk: parked.risk,
  surface: parked.surface,
  expiresAt: parked.expiresAt,
  message: `${parked.message} Still waiting on the operator — this call did not apply anything. Check xnet_pending_approvals, or ask the operator to decide and try again.`
})

const deniedResult = (): Record<string, unknown> => ({
  denied: true,
  message: 'The operator denied this action. Nothing was applied.'
})

const expiredResult = (reason: string): Record<string, unknown> => ({
  expired: true,
  message: reason
})

type Waiter = {
  parked: ParkedApproval
  /** Cleared once the wait bound fires — the action stays parked regardless. */
  answer: { resolve: (result: unknown) => void; reject: (err: unknown) => void } | null
  ttlTimer: ReturnType<typeof setTimeout>
  waitTimer: ReturnType<typeof setTimeout> | null
}

export function createApprovalBroker(
  recorder: AgentAuditRecorder,
  options: ApprovalBrokerOptions = {}
): ApprovalBroker {
  const clock = options.clock ?? (() => Date.now())
  const waiters = new Map<string, Waiter>()
  const listeners = new Set<(parked: ParkedApproval[]) => void>()

  const snapshot = (): ParkedApproval[] => [...waiters.values()].map((w) => w.parked)
  const notify = (): void => {
    const parked = snapshot()
    for (const listener of listeners) listener(parked)
  }

  const clearTimers = (waiter: Waiter): void => {
    clearTimeout(waiter.ttlTimer)
    if (waiter.waitTimer) clearTimeout(waiter.waitTimer)
  }

  const settle = (actionId: string, resolution: ApprovalResolution, result: unknown): void => {
    const waiter = waiters.get(actionId)
    if (!waiter) return
    waiters.delete(actionId)
    clearTimers(waiter)
    options.onResolved?.(actionId, resolution)
    waiter.answer?.resolve(result)
    notify()
  }

  /**
   * The operator approved and the tool threw. The caller must see the throw —
   * a released action that quietly resolves to nothing is indistinguishable
   * from one still waiting.
   */
  const fail = (actionId: string, err: unknown): void => {
    const waiter = waiters.get(actionId)
    if (!waiter) return
    waiters.delete(actionId)
    clearTimers(waiter)
    options.onResolved?.(actionId, 'failed')
    waiter.answer?.reject(err)
    notify()
  }

  // The recorder keys pending entries by actionId and does not echo the tool
  // name back, so read it off the pending list while the entry is still live.
  const toolNameFor = (actionId: string): string =>
    recorder.listPending().find((entry) => entry.actionId === actionId)?.name ?? 'tool'

  const park = (outcome: AgentPendingApproval, args: Record<string, unknown>): Promise<unknown> => {
    const parked: ParkedApproval = {
      actionId: outcome.actionId,
      tool: toolNameFor(outcome.actionId),
      args,
      risk: outcome.risk,
      surface: outcome.surface === 'chat' ? 'chat' : 'app',
      message: outcome.message,
      ...(outcome.nonce ? { code: outcome.nonce } : {}),
      expiresAt: outcome.expiresAt
    }
    return new Promise<unknown>((resolve, reject) => {
      const ttlTimer = setTimeout(
        () => {
          void recorder.expireStale().catch(() => undefined)
          settle(
            outcome.actionId,
            'expired',
            expiredResult(
              'The approval window expired before the operator decided. Nothing was applied.'
            )
          )
        },
        Math.max(0, outcome.expiresAt - clock())
      )
      // Bounded wait: hand the caller an honest "still pending" and let the
      // action keep waiting for a human. Deliberately not a settle() — the
      // parked entry, its TTL timer, and every surface rendering it survive.
      const waitTimer =
        options.maxWaitMs !== undefined && options.maxWaitMs < outcome.expiresAt - clock()
          ? setTimeout(() => {
              const waiter = waiters.get(outcome.actionId)
              if (!waiter?.answer) return
              const answer = waiter.answer
              waiter.answer = null
              waiter.waitTimer = null
              answer.resolve(stillPendingResult(parked))
            }, options.maxWaitMs)
          : null
      waiters.set(outcome.actionId, { parked, answer: { resolve, reject }, ttlTimer, waitTimer })
      options.onParked?.(parked)
      notify()
    })
  }

  return {
    async callTool(name, args = {}, instruction): Promise<unknown> {
      const outcome = await recorder.callTool(name, args, instruction)
      if (!outcome.pending) return outcome.result
      return await park(outcome, args)
    },

    async approve(actionId, approverDID): Promise<boolean> {
      if (!waiters.has(actionId)) return false
      try {
        const outcome = await recorder.approveFromApp(actionId, approverDID)
        if (!outcome.pending) settle(actionId, 'approved', outcome.result)
      } catch (err) {
        // The release itself succeeded and the tool threw. Hand the throw to
        // the parked caller rather than rethrowing here: the operator's click
        // did what it said, and the agent is the one that needs the error.
        fail(actionId, err)
      }
      return true
    },

    async approveWithCode(code, peer): Promise<boolean> {
      // The recorder throws for both "no such code" and "the released tool
      // failed", and those must not look alike — one means the text was never
      // a ceremony reply, the other means an approved action is now failing
      // with a caller still parked on it. `release()` deletes the entry before
      // executing, so an id that left the recorder's pending set marks the
      // second case.
      const before = recorder.listPending().map((entry) => entry.actionId)
      try {
        const outcome = await recorder.approveFromChat(code, peer)
        if (!outcome.pending) settle(outcome.actionId, 'approved', outcome.result)
        return true
      } catch (err) {
        const live = new Set(recorder.listPending().map((entry) => entry.actionId))
        const consumed = before.find((actionId) => !live.has(actionId))
        if (consumed === undefined) return false
        fail(consumed, err)
        return true
      }
    },

    async deny(actionId, approverDID): Promise<boolean> {
      if (!waiters.has(actionId)) return false
      await recorder.deny(actionId, approverDID)
      settle(actionId, 'denied', deniedResult())
      return true
    },

    listParked: snapshot,

    subscribe(listener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose(): void {
      for (const actionId of [...waiters.keys()]) {
        settle(
          actionId,
          'expired',
          expiredResult('The session ended before the operator decided. Nothing was applied.')
        )
      }
      listeners.clear()
    }
  }
}
