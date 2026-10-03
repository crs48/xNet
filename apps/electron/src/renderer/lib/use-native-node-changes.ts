import { useNodeStore } from '@xnetjs/react/internal'
import { useEffect, useState } from 'react'

/** Native import/enrichment writes share storage with the renderer's live store. */
export function useNativeNodeChanges(): string | null {
  const { store, isReady } = useNodeStore()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!store || !isReady) return
    const pending = new Set<string>()
    let active = true
    let running = false
    const drain = async () => {
      if (running || !active) return
      running = true
      try {
        while (active && pending.size) {
          const ids = Array.from(pending).slice(0, 100)
          ids.forEach((id) => pending.delete(id))
          try {
            await store.refreshPersistedNodes(ids)
          } catch (error) {
            ids.forEach((id) => pending.add(id))
            throw error
          }
        }
        if (active) setError(null)
      } catch (error) {
        if (active) setError(`Could not refresh saved library changes: ${String(error)}`)
      } finally {
        running = false
      }
    }
    const unsubscribe = window.xnetNodes.onChange(({ changes }) => {
      for (const change of changes) {
        const payload = (change as { payload?: { nodeId?: unknown } } | null)?.payload
        if (typeof payload?.nodeId !== 'string') {
          setError('A saved change notification was unreadable. Restart to reload the workspace.')
          return
        }
        pending.add(payload.nodeId)
      }
      void drain()
    })
    const retryAfterBarrier = window.xnet.onResumeEditing(() => void drain())
    return () => {
      active = false
      unsubscribe()
      retryAfterBarrier()
    }
  }, [store, isReady])
  return error
}
