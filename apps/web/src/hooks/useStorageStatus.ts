import type { PersistentStorageStatus } from '@xnetjs/sqlite'
import { checkPersistentStorage, watchPersistentStoragePermission } from '@xnetjs/sqlite'
import { useEffect, useState } from 'react'
import { subscribeStorageStatus } from '../lib/storage-durability'

/**
 * Latest durable-storage status for ambient UI (the StatusBar indicator).
 *
 * Mirrors useHubStatus: self-sourcing and decoupled from App's banner state.
 * Seeds from a free, prompt-less checkPersistentStorage(), then tracks the
 * storage-status bus (handlers that re-request after a notification/install
 * opt-in) and the permission watcher (a grant that lands mid-session).
 * Querying never spends a browser heuristic-based persistence request (0172).
 */
export function useStorageStatus(): PersistentStorageStatus | null {
  const [status, setStatus] = useState<PersistentStorageStatus | null>(null)

  useEffect(() => {
    let active = true
    const refresh = () => {
      void checkPersistentStorage().then((next) => {
        if (active) setStatus(next)
      })
    }
    refresh()
    const unsubscribeBus = subscribeStorageStatus((next) => {
      if (active) setStatus(next)
    })
    const unwatch = watchPersistentStoragePermission(refresh)
    return () => {
      active = false
      unsubscribeBus()
      unwatch()
    }
  }, [])

  return status
}
