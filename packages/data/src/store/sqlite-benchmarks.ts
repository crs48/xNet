/**
 * Repeatable SQLite NodeStore benchmark fixtures.
 */

import type { NodeState, PropertyTimestamp } from './types'
import type { SchemaIRI } from '../schema/node'
import type { DID } from '@xnetjs/core'

export const SQLITE_NODE_STORE_BENCHMARK_NODE_COUNTS = [1_000, 10_000, 100_000, 1_000_000] as const

export type SQLiteNodeStoreBenchmarkNodeCount =
  (typeof SQLITE_NODE_STORE_BENCHMARK_NODE_COUNTS)[number]

export type SQLiteNodeStoreBenchmarkCase = {
  nodeCount: SQLiteNodeStoreBenchmarkNodeCount
  enabledByDefault: boolean
  reason?: string
}

export type SQLiteMutationWriteAmplificationInput = {
  scalarPropertyCount: number
  adaptiveIndexCount: number
  updatesPerMutation?: number
}

export type SQLiteMutationWriteAmplificationEstimate = {
  scalarRowsDeleted: number
  scalarRowsInserted: number
  adaptiveIndexEntriesMaintained: number
  totalIndexEntriesTouched: number
  writeAmplificationFactor: number
}

export const SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT = 6

const DEFAULT_AUTOMATIC_NODE_LIMIT = 10_000

/**
 * Build the synthetic dataset plan used by the SQLite NodeStore benchmarks.
 *
 * 100k and 1M datasets are intentionally opt-in so regular local benchmark
 * smoke runs can stay fast while preserving coverage for larger scales.
 */
export function createSQLiteNodeStoreBenchmarkPlan(
  maxAutomaticNodeCount = DEFAULT_AUTOMATIC_NODE_LIMIT
): SQLiteNodeStoreBenchmarkCase[] {
  return SQLITE_NODE_STORE_BENCHMARK_NODE_COUNTS.map((nodeCount) => ({
    nodeCount,
    enabledByDefault: nodeCount <= maxAutomaticNodeCount,
    reason:
      nodeCount <= maxAutomaticNodeCount
        ? undefined
        : `set XNET_SQLITE_BENCH_MAX_NODES>=${nodeCount} to run`
  }))
}

export function createSQLiteBenchmarkNode(input: {
  index: number
  schemaId: SchemaIRI
  authorDID: DID
  createdAt?: number
  mutationOrdinal?: number
}): NodeState {
  const { index, schemaId, authorDID, createdAt = 1_700_000_000_000, mutationOrdinal = 0 } = input
  const updatedAt = createdAt + index + mutationOrdinal
  const status = index % 5 === 0 ? 'blocked' : index % 3 === 0 ? 'done' : 'open'
  const properties = {
    title: `Synthetic task ${index}`,
    status,
    priority: index % 100,
    score: (index * 17) % 10_000,
    bucket: `bucket-${index % 64}`,
    done: status === 'done'
  }
  const timestamps = createPropertyTimestamps(Object.keys(properties), authorDID, updatedAt)

  return {
    id: `bench-node-${index}`,
    schemaId,
    properties,
    timestamps,
    deleted: false,
    createdAt: createdAt + index,
    createdBy: authorDID,
    updatedAt,
    updatedBy: authorDID
  }
}

export function estimateSQLiteMutationWriteAmplification(
  input: SQLiteMutationWriteAmplificationInput
): SQLiteMutationWriteAmplificationEstimate {
  const updatesPerMutation = input.updatesPerMutation ?? 1
  const scalarRowsDeleted = input.scalarPropertyCount
  const scalarRowsInserted = input.scalarPropertyCount
  const adaptiveIndexEntriesMaintained = input.adaptiveIndexCount * updatesPerMutation
  const totalIndexEntriesTouched =
    scalarRowsDeleted + scalarRowsInserted + adaptiveIndexEntriesMaintained

  return {
    scalarRowsDeleted,
    scalarRowsInserted,
    adaptiveIndexEntriesMaintained,
    totalIndexEntriesTouched,
    writeAmplificationFactor: 1 + totalIndexEntriesTouched
  }
}

function createPropertyTimestamps(
  propertyKeys: string[],
  authorDID: DID,
  wallTime: number
): Record<string, PropertyTimestamp> {
  return Object.fromEntries(
    propertyKeys.map((key, index) => [
      key,
      {
        lamport: { time: index + 1, author: authorDID },
        wallTime
      }
    ])
  )
}
