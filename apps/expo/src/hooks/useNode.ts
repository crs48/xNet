/**
 * Node hook for Expo
 *
 * Fetches a single node by ID using the DataBridge.
 */
import type { NodeState } from '@xnet/data'
import { useState, useEffect, useCallback } from 'react'
import { useXNetContext } from '../context/XNetProvider'

interface UseNodeResult {
  node: NodeState | null
  loading: boolean
  error: Error | null
  update: (changes: Record<string, unknown>) => Promise<void>
  refresh: () => Promise<void>
}

export function useNode(nodeId: string | null): UseNodeResult {
  const { bridge, isReady } = useXNetContext()
  const [node, setNode] = useState<NodeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!bridge || !nodeId || !isReady) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // Use the `get` method from the bridge (available on NativeBridge)
      if (bridge.get) {
        const fetchedNode = await bridge.get(nodeId)
        setNode(fetchedNode)
      } else {
        // Fallback: use nodeStore directly if available
        const fetchedNode = await bridge.nodeStore?.get(nodeId)
        setNode(fetchedNode ?? null)
      }
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [bridge, nodeId, isReady])

  useEffect(() => {
    load()
  }, [load])

  const update = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!bridge || !nodeId) return
      try {
        const updatedNode = await bridge.update(nodeId, changes)
        setNode(updatedNode)
      } catch (e) {
        setError(e as Error)
      }
    },
    [bridge, nodeId]
  )

  return {
    node,
    loading,
    error,
    update,
    refresh: load
  }
}
