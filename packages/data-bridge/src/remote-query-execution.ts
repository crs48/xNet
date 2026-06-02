/**
 * Helpers for progressive remote Node query execution.
 */

import type {
  RemoteNodeQueryErrorResponse,
  RemoteNodeQueryMode,
  RemoteNodeQuerySource,
  RemoteNodeQuerySuccessResponse
} from './remote-query-protocol'
import type { QueryDescriptor, QueryMetadata, QueryPageInfo, QuerySource } from './types'
import type { NodeState } from '@xnetjs/data'
import { isRemoteNodeQuerySource } from './remote-query-protocol'

const REMOTE_QUERY_MODES = new Set<RemoteNodeQueryMode>([
  'local-then-remote',
  'remote',
  'live',
  'stream'
])

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
    !(error instanceof Error) && error.code === 'TIMEOUT' ? 'source-timeout' : 'remote-unavailable'

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
    verification: localMetadata.verification ?? {
      status: 'unverified'
    },
    error: message
  }
}
