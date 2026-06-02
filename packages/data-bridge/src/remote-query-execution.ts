/**
 * Helpers for progressive remote Node query execution.
 */

import type {
  RemoteNodeQueryErrorResponse,
  RemoteNodeQueryMode,
  RemoteNodeQuerySource,
  RemoteNodeQuerySuccessResponse
} from './remote-query-protocol'
import type {
  QueryDescriptor,
  QueryMetadata,
  NodeQueryRouterThresholds,
  QueryPageInfo,
  QueryRoutingMetadata,
  QuerySource,
  QueryVerificationMetadata
} from './types'
import type { NodeState } from '@xnetjs/data'
import { isRemoteNodeQuerySource } from './remote-query-protocol'

const REMOTE_QUERY_MODES = new Set<RemoteNodeQueryMode>([
  'local-then-remote',
  'remote',
  'live',
  'stream'
])

export const DEFAULT_NODE_QUERY_ROUTER_THRESHOLDS: NodeQueryRouterThresholds = {
  localRowThreshold: 10_000,
  hybridRowThreshold: 100_000,
  searchToRemote: true,
  spatialToRemote: true
}

export type RemoteNodeQueryRouteDecision =
  | {
      shouldRunRemote: false
      source: 'local'
      reason: string
      localRowCount?: number
      thresholds: NodeQueryRouterThresholds
    }
  | {
      shouldRunRemote: true
      mode: RemoteNodeQueryMode
      source: RemoteNodeQuerySource
      reason: string
      localRowCount?: number
      thresholds: NodeQueryRouterThresholds
    }

export function getRemoteQueryMode(descriptor: QueryDescriptor): RemoteNodeQueryMode | null {
  return descriptor.mode && REMOTE_QUERY_MODES.has(descriptor.mode as RemoteNodeQueryMode)
    ? (descriptor.mode as RemoteNodeQueryMode)
    : null
}

export function getRemoteQuerySource(descriptor: QueryDescriptor): RemoteNodeQuerySource {
  return isRemoteNodeQuerySource(descriptor.source) ? descriptor.source : 'hub'
}

export function shouldRunRemoteQuery(descriptor: QueryDescriptor): boolean {
  return descriptor.source !== 'local' && getRemoteQueryMode(descriptor) !== null
}

export function shouldUseRemoteOnlyQuery(descriptor: QueryDescriptor): boolean {
  return getRemoteQueryMode(descriptor) === 'remote'
}

export function normalizeNodeQueryRouterThresholds(
  thresholds?: Partial<NodeQueryRouterThresholds>
): NodeQueryRouterThresholds {
  return {
    ...DEFAULT_NODE_QUERY_ROUTER_THRESHOLDS,
    ...thresholds
  }
}

export function routeRemoteNodeQuery(input: {
  descriptor: QueryDescriptor
  localRowCount?: number
  hasRemoteClient: boolean
  thresholds?: Partial<NodeQueryRouterThresholds>
}): RemoteNodeQueryRouteDecision {
  const { descriptor, localRowCount, hasRemoteClient } = input
  const thresholds = normalizeNodeQueryRouterThresholds(input.thresholds)
  const mode = getRemoteQueryMode(descriptor)
  const remoteSource = getRemoteQuerySource(descriptor)

  if (descriptor.source === 'local' || descriptor.mode === 'local') {
    return {
      shouldRunRemote: false,
      source: 'local',
      reason: 'local-source',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  if (mode === 'remote') {
    return {
      shouldRunRemote: true,
      mode,
      source: remoteSource,
      reason: 'explicit-remote-mode',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  if (mode === 'live' || mode === 'stream') {
    return {
      shouldRunRemote: false,
      source: 'local',
      reason: 'stream-lifecycle',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  if (descriptor.source !== 'auto') {
    return mode === 'local-then-remote'
      ? {
          shouldRunRemote: true,
          mode,
          source: remoteSource,
          reason: 'explicit-progressive-mode',
          ...(localRowCount !== undefined ? { localRowCount } : {}),
          thresholds
        }
      : {
          shouldRunRemote: false,
          source: 'local',
          reason: 'local-by-default',
          ...(localRowCount !== undefined ? { localRowCount } : {}),
          thresholds
        }
  }

  if (!hasRemoteClient) {
    return {
      shouldRunRemote: false,
      source: 'local',
      reason: 'auto-no-remote-client',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  const progressiveMode: RemoteNodeQueryMode = mode ?? 'local-then-remote'

  if (descriptor.search && thresholds.searchToRemote) {
    return {
      shouldRunRemote: true,
      mode: progressiveMode,
      source: remoteSource,
      reason: 'auto-search',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  if (descriptor.spatial && thresholds.spatialToRemote) {
    return {
      shouldRunRemote: true,
      mode: progressiveMode,
      source: remoteSource,
      reason: 'auto-spatial',
      ...(localRowCount !== undefined ? { localRowCount } : {}),
      thresholds
    }
  }

  if (localRowCount === undefined) {
    return {
      shouldRunRemote: false,
      source: 'local',
      reason: 'auto-unknown-row-count',
      thresholds
    }
  }

  if (localRowCount >= thresholds.hybridRowThreshold) {
    return {
      shouldRunRemote: true,
      mode: progressiveMode,
      source: remoteSource,
      reason: 'auto-large-result',
      localRowCount,
      thresholds
    }
  }

  if (localRowCount >= thresholds.localRowThreshold) {
    return {
      shouldRunRemote: true,
      mode: progressiveMode,
      source: remoteSource,
      reason: 'auto-medium-result',
      localRowCount,
      thresholds
    }
  }

  return {
    shouldRunRemote: false,
    source: 'local',
    reason: 'auto-small-result',
    localRowCount,
    thresholds
  }
}

export function createQueryRoutingMetadata(
  route: RemoteNodeQueryRouteDecision
): QueryRoutingMetadata {
  return {
    source: route.shouldRunRemote ? route.source : 'local',
    reason: route.reason,
    ...(route.localRowCount !== undefined ? { localRowCount: route.localRowCount } : {}),
    thresholds: {
      localRowThreshold: route.thresholds.localRowThreshold,
      hybridRowThreshold: route.thresholds.hybridRowThreshold
    }
  }
}

function chooseNewestNode(left: NodeState, right: NodeState): NodeState {
  if (right.updatedAt > left.updatedAt) return right
  if (right.updatedAt < left.updatedAt) return left
  return right
}

export function mergeRemoteNodeSnapshots(
  localNodes: readonly NodeState[],
  remoteNodes: readonly NodeState[]
): NodeState[] {
  const merged = new Map<string, NodeState>()

  for (const node of remoteNodes) {
    const existing = merged.get(node.id)
    merged.set(node.id, existing ? chooseNewestNode(existing, node) : node)
  }

  for (const node of localNodes) {
    const existing = merged.get(node.id)
    merged.set(node.id, existing ? chooseNewestNode(existing, node) : node)
  }

  return [...merged.values()]
}

export function isRemoteVerificationFailed(
  verification: QueryVerificationMetadata | undefined
): boolean {
  return verification?.status === 'failed'
}

export function filterRemoteNodesByVerification(
  nodes: readonly NodeState[],
  verification: QueryVerificationMetadata | undefined
): NodeState[] {
  if (!verification || verification.status === 'verified' || verification.status === 'unverified') {
    return [...nodes]
  }

  if (verification.status === 'failed') {
    return []
  }

  const verifiedNodeIds = verification.verifiedNodeIds
    ? new Set(verification.verifiedNodeIds)
    : null
  const failedNodeIds = new Set(verification.failedNodeIds ?? [])

  return nodes.filter((node) => {
    if (failedNodeIds.has(node.id)) return false
    return verifiedNodeIds ? verifiedNodeIds.has(node.id) : true
  })
}

export function createRemoteVerificationError(input: {
  requestId: string
  source: RemoteNodeQuerySource
  message?: string
}): RemoteNodeQueryErrorResponse {
  return {
    type: 'node-query/error',
    requestId: input.requestId,
    source: input.source,
    code: 'VERIFICATION_FAILED',
    message: input.message ?? 'Remote query result verification failed'
  }
}

export function createRemoteSuccessMetadata(input: {
  response: RemoteNodeQuerySuccessResponse
  source: QuerySource
  loadedCount: number
}): QueryMetadata {
  const { response, source, loadedCount } = input
  const pageInfo: QueryPageInfo = {
    ...response.pageInfo,
    loadedCount
  }

  return {
    ...response.metadata,
    source,
    updatedAt: Date.now(),
    pageInfo,
    completeness: response.completeness,
    staleness: response.staleness,
    verification: response.verification
  }
}

export function createRemoteFallbackMetadata(input: {
  localMetadata: QueryMetadata
  error: RemoteNodeQueryErrorResponse | Error
}): QueryMetadata {
  const { localMetadata, error } = input
  const message = error instanceof Error ? error.message : error.message
  const reason =
    !(error instanceof Error) && error.code === 'TIMEOUT'
      ? 'source-timeout'
      : !(error instanceof Error) && error.code === 'VERIFICATION_FAILED'
        ? 'verification-failed'
        : 'remote-unavailable'
  const verification =
    !(error instanceof Error) && error.code === 'VERIFICATION_FAILED'
      ? ({ status: 'failed' } satisfies QueryVerificationMetadata)
      : (localMetadata.verification ?? { status: 'unverified' as const })

  return {
    ...localMetadata,
    source: localMetadata.source === 'local' ? 'hybrid' : localMetadata.source,
    updatedAt: Date.now(),
    completeness: {
      level: 'partial',
      reason
    },
    staleness: localMetadata.staleness ?? {
      level: 'stale',
      asOf: localMetadata.updatedAt
    },
    verification,
    error: message
  }
}

export function withRemoteErrorVerificationMetadata(
  metadata: QueryMetadata,
  error: RemoteNodeQueryErrorResponse | Error
): QueryMetadata {
  if (error instanceof Error || error.code !== 'VERIFICATION_FAILED') {
    return metadata
  }

  return {
    ...metadata,
    verification: {
      status: 'failed'
    }
  }
}
