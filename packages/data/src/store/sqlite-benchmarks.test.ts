import type { SchemaIRI } from '../schema/node'
import type { DID } from '@xnetjs/core'
import { describe, expect, it } from 'vitest'
import {
  SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT,
  SQLITE_NODE_STORE_BENCHMARK_NODE_COUNTS,
  createSQLiteBenchmarkNode,
  createSQLiteNodeStoreBenchmarkPlan,
  estimateSQLiteMutationWriteAmplification
} from './sqlite-benchmarks'

describe('sqlite benchmark fixtures', () => {
  const schemaId = 'xnet://bench/SQLiteNodeStore' as SchemaIRI
  const authorDID = 'did:key:z6Mkbenchsqlitefixtures' as DID

  it('covers the required synthetic dataset sizes', () => {
    expect(SQLITE_NODE_STORE_BENCHMARK_NODE_COUNTS).toEqual([1_000, 10_000, 100_000, 1_000_000])
  })

  it('marks large datasets as opt-in for regular benchmark runs', () => {
    const plan = createSQLiteNodeStoreBenchmarkPlan(10_000)

    expect(plan).toMatchObject([
      { nodeCount: 1_000, enabledByDefault: true },
      { nodeCount: 10_000, enabledByDefault: true },
      { nodeCount: 100_000, enabledByDefault: false },
      { nodeCount: 1_000_000, enabledByDefault: false }
    ])
    expect(plan[2].reason).toContain('XNET_SQLITE_BENCH_MAX_NODES')
  })

  it('generates deterministic scalar-heavy nodes for query and mutation benchmarks', () => {
    const node = createSQLiteBenchmarkNode({
      index: 42,
      schemaId,
      authorDID,
      createdAt: 1_000
    })

    expect(node).toMatchObject({
      id: 'bench-node-42',
      schemaId,
      deleted: false,
      properties: {
        title: 'Synthetic task 42',
        status: 'done',
        priority: 42,
        score: 714,
        bucket: 'bucket-42',
        done: true
      }
    })
    expect(Object.keys(node.properties)).toHaveLength(SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT)
    expect(Object.keys(node.timestamps)).toEqual(Object.keys(node.properties))
  })

  it('estimates scalar and adaptive index write amplification explicitly', () => {
    expect(
      estimateSQLiteMutationWriteAmplification({
        scalarPropertyCount: SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT,
        adaptiveIndexCount: 3,
        updatesPerMutation: 2
      })
    ).toEqual({
      scalarRowsDeleted: 6,
      scalarRowsInserted: 6,
      adaptiveIndexEntriesMaintained: 6,
      totalIndexEntriesTouched: 18,
      writeAmplificationFactor: 19
    })
  })
})
