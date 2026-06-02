/**
 * Tests for the versioned remote Node query protocol helpers.
 */

import type { RemoteNodeQueryResponse } from '../remote-query-protocol'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createQueryDescriptor } from '../query-descriptor'
import {
  REMOTE_NODE_QUERY_PROTOCOL,
  REMOTE_NODE_QUERY_PROTOCOL_VERSION,
  createRemoteNodeQueryRequest,
  isRemoteNodeQueryError,
  isRemoteNodeQuerySource,
  isRemoteNodeQuerySuccess
} from '../remote-query-protocol'

const TEST_SCHEMA_ID = 'xnet://test/Task' as SchemaIRI

describe('remote-query-protocol', () => {
  it('should create a versioned remote node query request', () => {
    const descriptor = createQueryDescriptor(TEST_SCHEMA_ID, {
      where: { status: 'open' },
      page: { first: 25 },
      mode: 'remote',
      source: 'hub'
    })

    const request = createRemoteNodeQueryRequest({
      requestId: 'query-1',
      descriptor,
      source: 'hub',
      requestedAt: 123,
      auth: { ucan: 'token' },
      client: { localSnapshotAt: 100, knownNodeIds: ['node-1'] }
    })

    expect(request).toMatchObject({
      protocol: REMOTE_NODE_QUERY_PROTOCOL,
      version: REMOTE_NODE_QUERY_PROTOCOL_VERSION,
      requestId: 'query-1',
      descriptor,
      mode: 'remote',
      source: 'hub',
      requestedAt: 123,
      auth: { ucan: 'token' },
      client: { localSnapshotAt: 100, knownNodeIds: ['node-1'] }
    })
  })

  it('should identify remote query sources and response variants', () => {
    const success = {
      type: 'node-query/result',
      requestId: 'query-1',
      source: 'federated',
      nodes: [],
      pageInfo: {
        totalCount: 0,
        countMode: 'exact',
        hasMore: false,
        hasNextPage: false,
        hasPreviousPage: false,
        loadedCount: 0
      },
      metadata: {
        source: 'federated',
        updatedAt: 123,
        pageInfo: {
          totalCount: 0,
          countMode: 'exact',
          hasMore: false,
          hasNextPage: false,
          hasPreviousPage: false,
          loadedCount: 0
        }
      },
      completeness: { level: 'complete' },
      staleness: { level: 'fresh', asOf: 123 },
      verification: { status: 'verified' }
    } satisfies RemoteNodeQueryResponse
    const error = {
      type: 'node-query/error',
      requestId: 'query-1',
      source: 'hub',
      code: 'REMOTE_UNAVAILABLE',
      message: 'Hub offline'
    } satisfies RemoteNodeQueryResponse

    expect(isRemoteNodeQuerySource('hub')).toBe(true)
    expect(isRemoteNodeQuerySource('federated')).toBe(true)
    expect(isRemoteNodeQuerySource('local')).toBe(false)
    expect(isRemoteNodeQuerySuccess(success)).toBe(true)
    expect(isRemoteNodeQueryError(success)).toBe(false)
    expect(isRemoteNodeQuerySuccess(error)).toBe(false)
    expect(isRemoteNodeQueryError(error)).toBe(true)
  })
})
