/**
 * @xnetjs/cloud/billing — budget-threshold alert notifier (exploration 0244).
 *
 * The metered gateway owns the hard 100% stop; this is the *surprise-bill warning*
 * layer. After each metered call it turns the spend delta into the set of alert
 * thresholds newly crossed ({@link crossedThresholds}: 50 / 80 / 95 / 100%) and
 * sends one notification per crossing — **idempotently** per `(tenant, window,
 * threshold)`, so a redelivery or a second call in the same window never re-alerts,
 * and the next window's crossings alert afresh.
 *
 * The transport (email, Slack, …) and the dedupe store are injected ports, so the
 * logic is pure and unit-tested with no I/O.
 */

import { crossedThresholds, DEFAULT_BUDGET_THRESHOLDS } from './budget'

export interface BudgetAlert {
  tenantId: string
  /** The crossed threshold as a fraction of the cap (0.5 | 0.8 | 0.95 | 1). */
  threshold: number
  /** Accrued spend at the time of the alert (USD). */
  usedUsd: number
  /** The hard cap (USD). */
  capUsd: number
  /** Opaque window identity (e.g. the window-start ms) — scopes idempotency + reset. */
  windowKey: string
}

/** Where alerts go (email/Slack/webhook). Injected so the notifier stays pure. */
export interface AlertTransport {
  send(alert: BudgetAlert): Promise<void>
}

/** Remembers which (tenant, window, threshold) alerts have already fired. */
export interface SentThresholdStore {
  /** Record `key` if unseen; returns true the first time only (so we send once). */
  markIfNew(key: string): Promise<boolean>
}

/** In-memory dedupe store for dev + tests. */
export class MemorySentThresholdStore implements SentThresholdStore {
  private readonly seen = new Set<string>()
  async markIfNew(key: string): Promise<boolean> {
    if (this.seen.has(key)) return false
    this.seen.add(key)
    return true
  }
}

/** Collects every alert it's asked to send — a transport for tests. */
export class RecordingAlertTransport implements AlertTransport {
  readonly sent: BudgetAlert[] = []
  async send(alert: BudgetAlert): Promise<void> {
    this.sent.push(alert)
  }
}

export interface BudgetAlertNotifierDeps {
  transport: AlertTransport
  store: SentThresholdStore
  /** Alert thresholds (default 50/80/95/100%). */
  thresholds?: readonly number[]
}

export interface NotifyArgs {
  tenantId: string
  /** Window identity (e.g. `String(windowStartMs)`) — resets idempotency per window. */
  windowKey: string
  /** Accrued spend before this call. */
  prevUsedUsd: number
  /** Accrued spend after this call. */
  newUsedUsd: number
  /** The hard cap (USD). */
  capUsd: number
}

export class BudgetAlertNotifier {
  private readonly thresholds: readonly number[]
  constructor(private readonly deps: BudgetAlertNotifierDeps) {
    this.thresholds = deps.thresholds ?? DEFAULT_BUDGET_THRESHOLDS
  }

  /** Send an alert for each newly-crossed threshold; returns the fired thresholds. */
  async notify(args: NotifyArgs): Promise<number[]> {
    const crossed = crossedThresholds(
      args.prevUsedUsd,
      args.newUsedUsd,
      args.capUsd,
      this.thresholds
    )
    const fired: number[] = []
    for (const threshold of crossed) {
      const key = `${args.tenantId}:${args.windowKey}:${threshold}`
      if (await this.deps.store.markIfNew(key)) {
        await this.deps.transport.send({
          tenantId: args.tenantId,
          threshold,
          usedUsd: args.newUsedUsd,
          capUsd: args.capUsd,
          windowKey: args.windowKey
        })
        fired.push(threshold)
      }
    }
    return fired
  }
}
