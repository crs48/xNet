/**
 * useViewRegistry — reactive access to the global view registry
 * (exploration 0339). Re-renders when plugins register/unregister views.
 */

import { useSyncExternalStore } from 'react'
import { viewRegistry, type Platform, type ViewRegistration } from '../registry.js'

export interface UseViewRegistryResult {
  /** All registered views */
  views: ViewRegistration[]
  /** Views for a platform */
  forPlatform: (platform: Platform) => ViewRegistration[]
  /** Lookup by type */
  get: (type: string) => ViewRegistration | undefined
}

let snapshot: ViewRegistration[] = viewRegistry.getAll()

function subscribe(onChange: () => void): () => void {
  return viewRegistry.onChange(() => {
    snapshot = viewRegistry.getAll()
    onChange()
  })
}

export function useViewRegistry(): UseViewRegistryResult {
  const views = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  )
  return {
    views,
    forPlatform: (platform) => views.filter((v) => !v.platforms || v.platforms.includes(platform)),
    get: (type) => views.find((v) => v.type === type)
  }
}
