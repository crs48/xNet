/**
 * Versioned protocol types for future remote Node descriptor reads.
 */

import type {
  QueryDescriptor,
  QueryExecutionMode,
  QueryMetadata,
  QueryPageInfo,
  QuerySourcePreference
} from './types'
import type { NodeState } from '@xnetjs/data'

export const REMOTE_NODE_QUERY_PROTOCOL = 'xnet.node-query'
export const REMOTE_NODE_QUERY_PROTOCOL_VERSION = 1

export type RemoteNodeQuerySource = Extract<QuerySourcePreference, 'hub' | 'federated'>

export type RemoteNodeQueryMode = Extract<
  QueryExecutionMode,
  'local-then-remote' | 'remote' | 'live' | 'stream'
>

export type RemoteNodeQueryAuth = {
  bearerToken?: string
  ucan?: string
  capabilities?: string[]
}

export type RemoteNodeQueryClientState = {
  localSnapshotAt?: number
  knownNodeIds?: string[]
}

export type RemoteQueryCompleteness = {
  level: 'complete' | 'partial' | 'unknown'
  reason?:
    | 'auth-filtered'
    | 'federation-partial'
    | 'page-limited'
    | 'remote-unavailable'
    | 'source-timeout'
  sourceCount?: number
}

export type RemoteQueryStaleness = {
  level: 'fresh' | 'stale' | 'unknown'
  asOf?: number
  maxAgeMs?: number
}

export type RemoteQueryVerification = {
  status: 'verified' | 'unverified' | 'failed' | 'mixed'
  verifiedNodeIds?: string[]
  failedNodeIds?: string[]
}

export type RemoteNodeQueryRequest = {
  protocol: typeof REMOTE_NODE_QUERY_PROTOCOL
  version: typeof REMOTE_NODE_QUERY_PROTOCOL_VERSION
  requestId: string
  descriptor: QueryDescriptor
  mode: RemoteNodeQueryMode
  source: RemoteNodeQuerySource
  requestedAt: number
  auth?: RemoteNodeQueryAuth
  client?: RemoteNodeQueryClientState
}

export type RemoteNodeQuerySuccessResponse = {
  type: 'node-query/result'
  requestId: string
  source: RemoteNodeQuerySource
  nodes: NodeState[]
  pageInfo: QueryPageInfo
  metadata: QueryMetadata
  completeness: RemoteQueryCompleteness
  staleness: RemoteQueryStaleness
  verification: RemoteQueryVerification
}

export type RemoteNodeQueryErrorResponse = {
  type: 'node-query/error'
  requestId: string
  source: RemoteNodeQuerySource
  code: 'AUTH_DENIED' | 'REMOTE_UNAVAILABLE' | 'QUERY_UNSUPPORTED' | 'TIMEOUT' | 'UNKNOWN'
  message: string
  retryAfterMs?: number
}

export type RemoteNodeQueryResponse = RemoteNodeQuerySuccessResponse | RemoteNodeQueryErrorResponse

export function isRemoteNodeQuerySource(
  source: QuerySourcePreference | undefined
): source is RemoteNodeQuerySource {
  return source === 'hub' || source === 'federated'
}

export function createRemoteNodeQueryRequest(input: {
  requestId: string
  descriptor: QueryDescriptor
  mode?: RemoteNodeQueryMode
  source: RemoteNodeQuerySource
  requestedAt?: number
  auth?: RemoteNodeQueryAuth
  client?: RemoteNodeQueryClientState
}): RemoteNodeQueryRequest {
  return {
    protocol: REMOTE_NODE_QUERY_PROTOCOL,
    version: REMOTE_NODE_QUERY_PROTOCOL_VERSION,
    requestId: input.requestId,
    descriptor: input.descriptor,
    mode: input.mode ?? 'remote',
    source: input.source,
    requestedAt: input.requestedAt ?? Date.now(),
    ...(input.auth ? { auth: input.auth } : {}),
    ...(input.client ? { client: input.client } : {})
  }
}

export function isRemoteNodeQuerySuccess(
  response: RemoteNodeQueryResponse
): response is RemoteNodeQuerySuccessResponse {
  return response.type === 'node-query/result'
}

export function isRemoteNodeQueryError(
  response: RemoteNodeQueryResponse
): response is RemoteNodeQueryErrorResponse {
  return response.type === 'node-query/error'
}
