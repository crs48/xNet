/**
 * Tests for query metadata derivation.
 */

import type { NodeQueryResult, NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createQueryDescriptor } from '../query-descriptor'
import { createQueryMetadata } from '../query-metadata'

const TEST_SCHEMA_ID = 'xnet://test/Task' as SchemaIRI

function createMockNode(id: string): NodeState {
  const now = Date.now()

  return {
    id,
    schemaId: TEST_SCHEMA_ID,
    properties: { title: id },
    timestamps: {
      title: { lamport: 1, author: 'did:key:test', wallTime: now }
    },
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

function createResult(nodes: NodeState[], candidateNodeCount: number): NodeQueryResult {
  return {
    nodes,
    plan: {
      strategy: 'storage-query',
      candidateNodeCount,
      hydratedNodeCount: nodes.length,
      returnedNodeCount: nodes.length,
      durationMs: 1
    }
  }
}

describe('query metadata', () => {
  it('should expose estimated counts when exact totals are unavailable', () => {
    const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
      page: { first: 10, count: 'estimate' }
    })
    const node = createMockNode('task-1')

    const metadata = createQueryMetadata({
      descriptor,
      result: createResult([node], 42),
      source: 'hub'
    })

    expect(metadata.pageInfo).toMatchObject({
      totalCount: 42,
      countMode: 'estimate',
      hasMore: true,
      loadedCount: 1
    })
  })

  it('should suppress counts when count mode is none', () => {
    const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
      page: { first: 10, count: 'none' }
    })
    const node = createMockNode('task-1')

    const metadata = createQueryMetadata({
      descriptor,
      result: { ...createResult([node], 42), totalCount: 42 },
      source: 'local'
    })

    expect(metadata.pageInfo).toMatchObject({
      totalCount: null,
      countMode: 'none',
      hasMore: false,
      loadedCount: 1
    })
  })
})
