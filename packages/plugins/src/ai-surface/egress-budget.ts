/**
 * Per-session egress budget for agent reads (exploration 0416).
 *
 * Exploration 0379 named the hazard: better retrieval widens the egress hole.
 * An agent that can find everything can exfiltrate everything, and the reads
 * that do it are individually innocuous — `xnet_query` twenty times is not a
 * suspicious call, it is twenty unsuspicious ones. The guardrail that catches
 * it has to be cumulative and session-scoped, not per-call.
 *
 * The design rule this follows is the repo's error policy: **a truncated run is
 * not a completed one**. When a read would push a session past its budget the
 * call fails with {@link EgressBudgetError} — it never returns a quietly short
 * result, because a short result is indistinguishable from "that is all the
 * data there was", which is precisely the answer an exfiltrating agent wants
 * the log to record.
 *
 * The budget meters *result* bytes, not row counts: 10 rows of a page body and
 * 10 rows of a checkbox column are not the same egress.
 */

import { TaggedError } from '@xnetjs/core'

/** Default per-session read budget: 2 MiB of serialized tool results. */
export const DEFAULT_EGRESS_BUDGET_BYTES = 2 * 1024 * 1024

/** Tools metered by the budget — the read path, not the write path. */
export const METERED_READ_TOOLS = new Set([
  'xnet_query',
  'xnet_get',
  'xnet_search',
  'xnet_read_page',
  'xnet_context_pack'
])

/**
 * Raised when a read would exceed the session's egress budget.
 *
 * Loud and typed by design: the caller must be able to tell "budget exhausted"
 * from "no more rows", and the agent must receive an error rather than a
 * plausible-looking empty tail.
 */
export class EgressBudgetError extends TaggedError<'EgressBudgetError'> {
  readonly _tag = 'EgressBudgetError'

  constructor(
    readonly tool: string,
    readonly spentBytes: number,
    readonly budgetBytes: number,
    readonly attemptedBytes: number
  ) {
    super(
      `Egress budget exhausted: ${tool} would return ${attemptedBytes} bytes, ` +
        `but this session has spent ${spentBytes} of ${budgetBytes} bytes. ` +
        `The result was NOT truncated — re-run with a narrower query, or raise the session budget.`
    )
  }
}

export type EgressMeterOptions = {
  budgetBytes?: number
  /** Which tool names to meter. Defaults to {@link METERED_READ_TOOLS}. */
  meteredTools?: Set<string>
}

/**
 * Cumulative read meter for one agent session.
 *
 * Instances are per-session by construction — a shared meter would let one
 * agent's reads exhaust another's budget.
 */
export class EgressMeter {
  private spent = 0
  private readonly budget: number
  private readonly metered: Set<string>

  constructor(options: EgressMeterOptions = {}) {
    this.budget = options.budgetBytes ?? DEFAULT_EGRESS_BUDGET_BYTES
    this.metered = options.meteredTools ?? METERED_READ_TOOLS
  }

  /** Bytes spent so far this session. */
  get spentBytes(): number {
    return this.spent
  }

  get budgetBytes(): number {
    return this.budget
  }

  /** Bytes still available. Never negative. */
  get remainingBytes(): number {
    return Math.max(0, this.budget - this.spent)
  }

  /** Whether this tool's results count against the budget. */
  meters(tool: string): boolean {
    return this.metered.has(tool)
  }

  /**
   * Charge a completed read against the budget.
   *
   * Called *after* the tool returns, because only then is the true size known.
   * The result is still refused rather than delivered: handing over the bytes
   * and then recording an overage would make the budget advisory.
   *
   * @throws {EgressBudgetError} If this result would exceed the budget.
   */
  charge(tool: string, result: unknown): void {
    if (!this.meters(tool)) return

    const size = measureBytes(result)
    if (this.spent + size > this.budget) {
      throw new EgressBudgetError(tool, this.spent, this.budget, size)
    }
    this.spent += size
  }
}

/**
 * Serialized byte size of a tool result.
 *
 * An unserializable result is charged as 0 rather than throwing — the meter is
 * a guardrail, and it must not be the thing that breaks a legitimate read.
 */
export function measureBytes(result: unknown): number {
  if (result === undefined || result === null) return 0
  if (typeof result === 'string') return new TextEncoder().encode(result).length
  try {
    return new TextEncoder().encode(JSON.stringify(result)).length
  } catch {
    return 0
  }
}
