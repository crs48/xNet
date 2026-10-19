import type { NodeState, TransactionConditions } from './types'
import { TaggedError } from '@xnetjs/core'

export class TransactionConflictError extends TaggedError<'TransactionConflictError'> {
  readonly _tag = 'TransactionConflictError' as const
  constructor(
    readonly code: 'conflict' | 'expired' | 'unsupported',
    message: string
  ) {
    super(message)
  }
}

/** Stable structural comparison: timestamps and tombstones are part of the snapshot. */
export function snapshotKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(snapshotKey).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${snapshotKey(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function assertTransactionConditions(
  conditions: TransactionConditions,
  get: (id: string) => NodeState | null,
  head: (id: string) => string | undefined
): void {
  if (!Number.isFinite(conditions.deadline) || Date.now() >= conditions.deadline)
    throw new TransactionConflictError('expired', 'The conditional transaction expired.')
  for (const { id, expected, head: expectedHead } of conditions.nodes)
    if (
      snapshotKey(get(id)) !== snapshotKey(expected) ||
      (expectedHead !== undefined && head(id) !== expectedHead)
    )
      throw new TransactionConflictError(
        'conflict',
        'A record changed before the conditional transaction committed.'
      )
}
