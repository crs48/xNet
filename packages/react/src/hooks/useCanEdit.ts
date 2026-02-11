/**
 * useCanEdit - Resolve editor/viewer capabilities for a node.
 */

import { useEffect, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

const GRANT_SCHEMA_ID = 'xnet://xnet.fyi/Grant'

type ChangeEventLike = {
  change?: { payload?: { nodeId?: string } }
  node?: { schemaId?: string; properties?: Record<string, unknown> }
}

export type UseCanEditResult = {
  canEdit: boolean
  canView: boolean
  loading: boolean
  error: Error | null
  roles: string[]
}

const INITIAL_STATE: UseCanEditResult = {
  canEdit: false,
  canView: false,
  loading: true,
  error: null,
  roles: []
}

export function useCanEdit(nodeId: string): UseCanEditResult {
  const { store, isReady } = useNodeStore()
  const [state, setState] = useState<UseCanEditResult>(INITIAL_STATE)
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
        const [read, write] = await Promise.all([
          store.auth!.can({ action: 'read', nodeId }),
          store.auth!.can({ action: 'write', nodeId })
        ])

        if (requestRef.current !== requestId) return

        const roleSet = new Set<string>([...read.roles, ...write.roles])
        setState({
          canEdit: write.allowed,
          canView: read.allowed && !write.allowed,
          loading: false,
          error: null,
          roles: Array.from(roleSet)
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
