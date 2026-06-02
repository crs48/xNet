/**
 * Query stream event types and deterministic reducers.
 */

import type { QueryMetadata } from './types'
import type { NodeState } from '@xnetjs/data'

export type QueryStreamProgressPhase =
  | 'connecting'
  | 'snapshot'
  | 'catching-up'
  | 'live'
  | 'reconnecting'
  | 'complete'

export type QueryStreamProgress = {
  phase: QueryStreamProgressPhase
  loaded?: number
  total?: number | null
  message?: string
}

export type QueryStreamResetReason =
  | 'descriptor-changed'
  | 'reconnect'
  | 'server-reset'
  | 'client-reset'

export type QueryStreamEvent =
  | {
      type: 'snapshot'
      nodes: NodeState[]
      metadata?: QueryMetadata | null
    }
  | {
      type: 'insert'
      node: NodeState
      index?: number
      metadata?: QueryMetadata | null
    }
  | {
      type: 'update'
      nodeId: string
      node: NodeState
      metadata?: QueryMetadata | null
    }
  | {
      type: 'delete'
      nodeId: string
      metadata?: QueryMetadata | null
    }
  | {
      type: 'reset'
      reason: QueryStreamResetReason
      nodes?: NodeState[]
      metadata?: QueryMetadata | null
    }
  | {
      type: 'progress'
      progress: QueryStreamProgress
      metadata?: QueryMetadata | null
    }
  | {
      type: 'error'
      error: string
      code?: string
      recoverable?: boolean
      metadata?: QueryMetadata | null
    }

export type QueryStreamStatus = 'idle' | 'loading' | 'ready' | 'error'

export type QueryStreamState = {
  data: NodeState[] | null
  metadata: QueryMetadata | null
  progress: QueryStreamProgress | null
  error: string | null
  status: QueryStreamStatus
}

export function createQueryStreamState(input?: {
  data?: NodeState[] | null
  metadata?: QueryMetadata | null
  progress?: QueryStreamProgress | null
  error?: string | null
  status?: QueryStreamStatus
}): QueryStreamState {
  return {
    data: input?.data ?? null,
    metadata: input?.metadata ?? null,
    progress: input?.progress ?? null,
    error: input?.error ?? null,
    status: input?.status ?? 'idle'
  }
}

function getNextMetadata(
  event: QueryStreamEvent,
  currentMetadata: QueryMetadata | null
): QueryMetadata | null {
  return 'metadata' in event && event.metadata !== undefined ? event.metadata : currentMetadata
}

function insertNode(nodes: NodeState[], node: NodeState, index?: number): NodeState[] {
  const withoutExisting = nodes.filter((item) => item.id !== node.id)
  if (index === undefined) return [...withoutExisting, node]

  const boundedIndex = Math.max(0, Math.min(index, withoutExisting.length))
  return [...withoutExisting.slice(0, boundedIndex), node, ...withoutExisting.slice(boundedIndex)]
}

function updateNode(nodes: NodeState[], nodeId: string, node: NodeState): NodeState[] {
  return nodes.map((item) => (item.id === nodeId ? node : item))
}

function deleteNode(nodes: NodeState[], nodeId: string): NodeState[] {
  return nodes.filter((item) => item.id !== nodeId)
}

export function reduceQueryStreamEvent(
  state: QueryStreamState,
  event: QueryStreamEvent
): QueryStreamState {
  const metadata = getNextMetadata(event, state.metadata)

  switch (event.type) {
    case 'snapshot':
      return {
        data: event.nodes,
        metadata,
        progress: state.progress,
        error: null,
        status: 'ready'
      }
    case 'insert':
      return {
        data: insertNode(state.data ?? [], event.node, event.index),
        metadata,
        progress: state.progress,
        error: null,
        status: 'ready'
      }
    case 'update':
      return {
        data: updateNode(state.data ?? [], event.nodeId, event.node),
        metadata,
        progress: state.progress,
        error: null,
        status: 'ready'
      }
    case 'delete':
      return {
        data: deleteNode(state.data ?? [], event.nodeId),
        metadata,
        progress: state.progress,
        error: null,
        status: 'ready'
      }
    case 'reset':
      return {
        data: event.nodes ?? null,
        metadata,
        progress: state.progress,
        error: null,
        status: event.nodes ? 'ready' : 'loading'
      }
    case 'progress':
      return {
        data: state.data,
        metadata,
        progress: event.progress,
        error: state.error,
        status: state.data === null ? 'loading' : state.status
      }
    case 'error':
      return {
        data: state.data,
        metadata,
        progress: state.progress,
        error: event.error,
        status: event.recoverable ? state.status : 'error'
      }
  }
}

export function reduceQueryStreamEvents(
  state: QueryStreamState,
  events: readonly QueryStreamEvent[]
): QueryStreamState {
  return events.reduce(reduceQueryStreamEvent, state)
}
