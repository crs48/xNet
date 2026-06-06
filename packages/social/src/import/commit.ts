/**
 * Commit staged social nodes into NodeStore.
 */

import type { StagedSocialRecord } from './types'
import type { NodeStore, SchemaIRI, TransactionOperation } from '@xnetjs/data'

export type SocialCommitSummary = {
  created: number
  updated: number
  skipped: number
  operationCount: number
}

export async function buildSocialCommitOperations(
  store: Pick<NodeStore, 'get'>,
  records: readonly StagedSocialRecord[]
): Promise<{ operations: TransactionOperation[]; summary: SocialCommitSummary }> {
  const uniqueNodes = dedupeById(records.filter((record) => record.kind !== 'source-record'))
  const operations: TransactionOperation[] = []
  let created = 0
  let updated = 0

  for (const record of uniqueNodes) {
    const existing = await store.get(record.deterministicId)
    if (existing) {
      operations.push({
        type: 'update',
        nodeId: record.deterministicId,
        options: { properties: record.properties }
      })
      updated += 1
    } else {
      operations.push({
        type: 'create',
        options: {
          id: record.deterministicId,
          schemaId: record.schemaId as SchemaIRI,
          properties: record.properties
        }
      })
      created += 1
    }
  }

  return {
    operations,
    summary: {
      created,
      updated,
      skipped: records.length - uniqueNodes.length,
      operationCount: operations.length
    }
  }
}

export async function commitStagedSocialNodes(
  store: Pick<NodeStore, 'get' | 'transaction'>,
  records: readonly StagedSocialRecord[]
): Promise<SocialCommitSummary> {
  const { operations, summary } = await buildSocialCommitOperations(store, records)
  if (operations.length > 0) await store.transaction(operations)
  return summary
}

function dedupeById<T extends { deterministicId: string }>(records: readonly T[]): T[] {
  return [...new Map(records.map((record) => [record.deterministicId, record])).values()]
}
