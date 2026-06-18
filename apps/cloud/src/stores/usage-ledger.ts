/**
 * xNet Cloud — durable usage ledger over a {@link DocStore}.
 *
 * The AI usage ledger is the authoritative record of metered spend, so it must
 * survive a control-plane restart (an in-memory ledger would forget a tenant's
 * accrued spend and re-open the budget on every deploy). We back the
 * `@xnetjs/cloud` `UsageLedger` port with the same tiny `DocStore` we use for
 * tenants + bindings (PR #175), keyed by the entry's idempotency key so a
 * redelivered usage event is a no-op `put` we can detect (exploration 0200).
 *
 * `totalChargeUsd`/`entries` scan + filter (`inScope`) — fine at control-plane
 * scale; swap for an indexed/period-partitioned query if the ledger grows large.
 */

import {
  MemoryUsageLedger,
  inScope,
  type UsageEntry,
  type UsageLedger
} from '@xnetjs/cloud/billing'
import type { DocStore } from './durable'
import { FirestoreDocStore, firestoreFromEnv } from './firestore'

/** A durable, idempotent UsageLedger over a DocStore keyed by `entry.key`. */
export function usageLedgerFromDocs(docs: DocStore<UsageEntry>): UsageLedger {
  return {
    async record(entry) {
      if ((await docs.get(entry.key)) !== null) return { recorded: false }
      await docs.put(entry.key, entry)
      return { recorded: true }
    },
    async totalChargeUsd(tenantId, sinceMs) {
      const all = await docs.list()
      return all.reduce((sum, e) => (inScope(e, tenantId, sinceMs) ? sum + e.chargeUsd : sum), 0)
    },
    async entries(tenantId, sinceMs) {
      const all = await docs.list()
      return all.filter((e) => inScope(e, tenantId, sinceMs))
    }
  }
}

/**
 * The durable usage ledger when Firestore is configured (collection `usage`),
 * else an in-memory ledger for dev/tests. Survives a control-plane restart so a
 * tenant's accrued AI spend is not forgotten (exploration 0200).
 */
export function usageLedgerFromEnv(env: NodeJS.ProcessEnv = process.env): UsageLedger {
  const firestore = firestoreFromEnv(env)
  if (!firestore) return new MemoryUsageLedger()
  return usageLedgerFromDocs(new FirestoreDocStore<UsageEntry>(firestore.collection('usage')))
}
