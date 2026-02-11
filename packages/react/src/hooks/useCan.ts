/**
 * useCan - Check current user's permissions for a node.
 */

import { useEffect, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'

export interface UseCanResult {
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
  canShare: boolean
  loading: boolean
  error: Error | null
  isFresh: boolean
  evaluatedAt: number
}

const INITIAL_STATE: UseCanResult = {
  canRead: false,
  canWrite: false,
  canDelete: false,
  canShare: false,
  loading: true,
  error: null,
  isFresh: false,
  evaluatedAt: 0
}

type ChangeEventLike = {
  change?: { payload?: { nodeId?: string } }
  node?: { schemaId?: string; properties?: Record<string, unknown> }
}

export function useCan(nodeId: string): UseCanResult {
  const { store, isReady } = useNodeStore()
  const [state, setState] = useState<UseCanResult>(INITIAL_STATE)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!store || !isReady) {
      setState((prev) => ({ ...prev, loading: true }))
      return
    }

    if (!store.auth) {
      setState({
        ...INITIAL_STATE,
        loading: false,
        error: new Error('Authorization API is not configured on this NodeStore')
      })
      return
    }

    const run = async (): Promise<void> => {
      const requestId = ++requestRef.current
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const [read, write, del, share] = await Promise.all([
          store.auth!.can({ action: 'read', nodeId }),
          store.auth!.can({ action: 'write', nodeId }),
          store.auth!.can({ action: 'delete', nodeId }),
          store.auth!.can({ action: 'share', nodeId })
        ])

        if (requestRef.current !== requestId) return

        setState({
          canRead: read.allowed,
          canWrite: write.allowed,
          canDelete: del.allowed,
          canShare: share.allowed,
          loading: false,
          error: null,
          isFresh: !read.cached,
          evaluatedAt: read.evaluatedAt
        })
      } catch (error) {
        if (requestRef.current !== requestId) return

        const normalized = error instanceof Error ? error : new Error(String(error))
        setState((prev) => ({ ...prev, loading: false, error: normalized }))
      }
    }

    void run()

    const unsubscribe = store.subscribe((event) => {
      const typedEvent = event as ChangeEventLike
      const eventNodeId = typedEvent.change?.payload?.nodeId
      if (eventNodeId === nodeId) {
        void run()
        return
      }

      const isGrantUpdate = typedEvent.node?.schemaId === GRANT_SCHEMA_ID
      const grantResource = typedEvent.node?.properties?.resource
      if (isGrantUpdate && grantResource === nodeId) {
        void run()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [isReady, nodeId, store])

  return state
}
