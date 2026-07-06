/**
 * Storage durability + corruption watchers, extracted from App.tsx: the
 * persistent-storage permission watcher, the out-of-band storage-status
 * subscription, and the SQLite corruption subscription — unified into one
 * hook that feeds status changes back into the boot state machine.
 */
import type { AppState, StorageContext } from './boot-machine'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { checkPersistentStorage, watchPersistentStoragePermission } from '@xnetjs/sqlite'
import { useEffect } from 'react'
import { subscribeXNetStorageCorruption } from '../lib/browser-storage-reset'
import { recordDurabilityTransition, subscribeStorageStatus } from '../lib/storage-durability'
import { updateAppStorageStatus } from './boot-machine'

export function useStorageDurability(
  setAppState: Dispatch<SetStateAction<AppState>>,
  storageRef: MutableRefObject<StorageContext | null>
): void {
  // A persistent-storage grant can land mid-session (notification opt-in,
  // install, engagement crossing Chrome's threshold). Watching the
  // permission is free — it never spends or triggers a request (0172).
  useEffect(() => {
    return watchPersistentStoragePermission((state) => {
      if (state !== 'granted') return
      void checkPersistentStorage().then((storageStatus) => {
        recordDurabilityTransition('permission-change', storageStatus)
        setAppState((current) => updateAppStorageStatus(current, storageStatus))
      })
    })
  }, [setAppState])

  // Statuses produced outside App's own handlers (the desktop-alerts
  // opt-in chains a persist() request after a notification grant).
  useEffect(() => {
    return subscribeStorageStatus((storageStatus) => {
      setAppState((current) => updateAppStorageStatus(current, storageStatus))
    })
  }, [setAppState])

  useEffect(() => {
    return subscribeXNetStorageCorruption((error) => {
      const storage = storageRef.current
      storageRef.current = null

      void storage?.storageAdapter.close().catch(console.error)
      void storage?.sqliteAdapter.close().catch(console.error)

      setAppState({ status: 'storage-corrupt', error })
    })
  }, [setAppState, storageRef])
}
