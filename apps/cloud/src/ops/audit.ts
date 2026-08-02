/**
 * xNet Cloud — the two-tier operator audit log (exploration 0433, ADR-31).
 *
 * **Tier 1** is a fail-closed write to the control plane's own store. It is the
 * gate: if it does not land, the action does not run. It lives here rather than
 * on the ops hub because it must be available during exactly the incidents when
 * the hub might not be — an operator who cannot act during an outage is worse
 * than one whose audit history is briefly stale.
 *
 * **Tier 2** is the same entry republished as a signed xNet node authored by the
 * operator's `did:key`, which makes it *verifiable* rather than merely
 * append-only: nobody with database access can forge it, and no operator can
 * repudiate it. It publishes asynchronously, and when the hub is unreachable the
 * entry queues. The queue depth is an alertable metric precisely so a gap between
 * the tiers is visible rather than silent — "absent" and "unreadable" must be
 * different values (`AGENTS.md`).
 *
 * Entries carry an operator, an action, a tenant id and a reason. They never
 * carry parameters, because a parameter is where tenant content would leak into
 * a log that outlives the tenant.
 */

import type { DocStore } from '../stores/durable'

/** What an operator did. Reads are recorded too, at a lower ceremony (decision 5). */
export type AuditAction =
  /** Opened a specific tenant. Audited silently — recorded, no reason prompt. */
  | 'tenant.read'
  /** Cleared a tenant's bound DID so a fresh device can claim the hub. */
  | 'tenant.recover'
  | 'tenant.plan-change'
  | 'tenant.delete-data'
  | 'tenant.provision'
  /** Granted or revoked operator access — itself an audited action. */
  | 'operator.bind'
  | 'operator.retire'
  /** Tier 2 consent lifecycle. */
  | 'consent.request'
  | 'consent.grant'
  | 'consent.deny'
  | 'consent.expire'

/** Actions that change state, and therefore require a typed reason (decision 5). */
const MUTATING_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'tenant.recover',
  'tenant.plan-change',
  'tenant.delete-data',
  'tenant.provision',
  'operator.bind',
  'operator.retire'
])

export const requiresReason = (action: AuditAction): boolean => MUTATING_ACTIONS.has(action)

export type AuditOutcome = 'started' | 'ok' | 'failed'

export interface AuditEntry {
  /** Monotonic-ish id: time-ordered so `page()` reads chronologically. */
  entryId: string
  atMs: number
  /** WorkOS user id of the operator. Never a shared secret. */
  operator: string
  /** The signing key bound to that operator when the entry was written. */
  operatorDid?: string
  action: AuditAction
  /** Opaque tenant identifier. Retained after tenant deletion (decision 15). */
  tenantId: string
  /** Free text typed by the operator. Required for mutations, absent for reads. */
  reason?: string
  outcome: AuditOutcome
  /** Links `ok`/`failed` back to the `started` entry that authorised the action. */
  parentId?: string
  /** Whether the signed tier-2 copy has been published to the ops hub. */
  published?: boolean
}

/** Publishes a signed copy to the ops hub. Failure must never block the action. */
export interface AuditPublisher {
  publish(entry: AuditEntry): Promise<void>
}

/** The error a caller sees when the fail-closed tier-1 write does not land. */
export class AuditWriteError extends Error {
  constructor(cause: unknown) {
    super(`audit: tier-1 write failed, action refused: ${String(cause)}`)
    this.name = 'AuditWriteError'
  }
}

/** The error a caller sees when a mutating action arrives without a reason. */
export class ReasonRequiredError extends Error {
  constructor(action: AuditAction) {
    super(`audit: ${action} requires a reason`)
    this.name = 'ReasonRequiredError'
  }
}

const pad = (n: number): string => String(n).padStart(16, '0')

export interface AuditLogOptions {
  docs: DocStore<AuditEntry>
  publisher?: AuditPublisher
  nowMs?: () => number
  /** Injectable for deterministic ids in tests. */
  suffix?: () => string
}

/**
 * The tier-1 log plus the tier-2 publish queue.
 *
 * Entries are ids of the form `<paddedTime>-<suffix>` so the `DocStore`'s
 * id-ordered `page()` reads them chronologically without a secondary index.
 */
export class AuditLog {
  private readonly docs: DocStore<AuditEntry>
  private readonly publisher?: AuditPublisher
  private readonly now: () => number
  private readonly suffix: () => string
  /** Entries written to tier 1 but not yet confirmed on the ops hub. */
  private readonly pending: AuditEntry[] = []
  private seq = 0

  constructor(opts: AuditLogOptions) {
    this.docs = opts.docs
    this.publisher = opts.publisher
    this.now = opts.nowMs ?? (() => Date.now())
    this.suffix = opts.suffix ?? (() => String(++this.seq).padStart(6, '0'))
  }

  /**
   * Write one entry to tier 1, then hand it to tier 2.
   *
   * Throws {@link AuditWriteError} if tier 1 fails — that is the fail-closed gate,
   * and callers must let it propagate rather than proceeding unaudited. A tier-2
   * failure only queues.
   */
  async append(
    entry: Omit<AuditEntry, 'entryId' | 'atMs'> & { atMs?: number }
  ): Promise<AuditEntry> {
    if (requiresReason(entry.action) && !entry.reason?.trim()) {
      throw new ReasonRequiredError(entry.action)
    }
    const atMs = entry.atMs ?? this.now()
    const record: AuditEntry = { ...entry, atMs, entryId: `${pad(atMs)}-${this.suffix()}` }
    try {
      await this.docs.put(record.entryId, record)
    } catch (err) {
      throw new AuditWriteError(err)
    }
    await this.publish(record)
    return record
  }

  /** Best-effort tier-2 publish. Queues on failure; never throws. */
  private async publish(record: AuditEntry): Promise<void> {
    if (!this.publisher) {
      this.pending.push(record)
      return
    }
    try {
      await this.publisher.publish(record)
      await this.docs.put(record.entryId, { ...record, published: true })
    } catch {
      this.pending.push(record)
    }
  }

  /**
   * How many entries are written to tier 1 but not confirmed on the ops hub.
   *
   * This is the alertable metric. A depth that stops returning to zero means the
   * verifiable half of the audit trail has quietly stopped — the failure that,
   * unmeasured, would look exactly like a healthy system.
   */
  pendingCount(): number {
    return this.pending.length
  }

  /** Retry queued publishes. Returns how many drained. */
  async drain(): Promise<number> {
    if (!this.publisher || this.pending.length === 0) return 0
    let drained = 0
    // Iterate a snapshot; failures go back on the queue in order.
    const batch = this.pending.splice(0, this.pending.length)
    for (const record of batch) {
      try {
        await this.publisher.publish(record)
        await this.docs.put(record.entryId, { ...record, published: true })
        drained += 1
      } catch {
        this.pending.push(record)
      }
    }
    return drained
  }

  /** Every entry touching a tenant, oldest first. Survives that tenant's deletion. */
  async forTenant(tenantId: string): Promise<AuditEntry[]> {
    const rows = await this.docs.findWhere('tenantId', tenantId)
    return rows.sort((a, b) => a.entryId.localeCompare(b.entryId))
  }

  /** Every entry by one operator, oldest first. */
  async byOperator(operator: string): Promise<AuditEntry[]> {
    const rows = await this.docs.findWhere('operator', operator)
    return rows.sort((a, b) => a.entryId.localeCompare(b.entryId))
  }
}

/**
 * Run a privileged action with the audit entry written FIRST.
 *
 * Ordering is the point. An action that fails must still be attributable, and an
 * operator must not be able to act and then suppress the record by crashing the
 * process. The `started` entry is durable before `run()` is called; the outcome
 * entry links back to it.
 */
export async function audited<T>(
  log: AuditLog,
  entry: Omit<AuditEntry, 'entryId' | 'atMs' | 'outcome'>,
  run: () => Promise<T>
): Promise<T> {
  const started = await log.append({ ...entry, outcome: 'started' })
  try {
    const result = await run()
    await log.append({ ...entry, outcome: 'ok', parentId: started.entryId })
    return result
  } catch (err) {
    await log.append({ ...entry, outcome: 'failed', parentId: started.entryId })
    throw err
  }
}
