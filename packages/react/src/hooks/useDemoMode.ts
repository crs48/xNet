/**
 * useDemoMode - Hook for detecting demo mode from hub handshake
 *
 * Returns demo mode state including whether the connected hub is in demo mode
 * and the associated limits (quota, max docs, eviction time).
 */
import { useState, useEffect } from 'react'
import { useXNet } from '../context'

/**
 * Demo mode limits (from hub handshake)
 */
export interface DemoLimits {
  /** Storage quota in bytes */
  quotaBytes: number
  /** Maximum number of documents */
  maxDocs: number
  /** Eviction time in hours */
  evictionHours: number
}

/**
 * Demo mode usage stats (future: populated from hub)
 */
export interface DemoUsage {
  /** Bytes currently used */
  usedBytes: number
  /** Number of documents */
  docCount: number
}

/**
 * Demo mode state
 */
export interface DemoModeState {
  /** Whether connected to a demo hub */
  isDemo: boolean
  /** Demo mode limits (if in demo mode) */
  limits?: DemoLimits
  /** Current usage (if in demo mode and available) */
  usage?: DemoUsage
}

/**
 * Hook to detect and track demo mode from hub connection
 *
 * Listens for the handshake message from the hub which includes `isDemo`
 * and `demoLimits` fields when connected to a demo hub.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isDemo, limits } = useDemoMode()
 *
 *   return (
 *     <div>
 *       {isDemo && limits && (
 *         <DemoBanner evictionHours={limits.evictionHours} />
 *       )}
 *       <MainContent />
 *     </div>
 *   )
 * }
 * ```
 */
export function useDemoMode(): DemoModeState {
  const { syncManager } = useXNet()
  const [state, setState] = useState<DemoModeState>({ isDemo: false })

  useEffect(() => {
    if (!syncManager?.connection) return

    const connection = syncManager.connection

    // Listen for handshake message from hub
    const unsubscribe = connection.onMessage((message) => {
      if (message.type !== 'handshake') return

      const isDemo = message.isDemo === true
      if (!isDemo) {
        setState({ isDemo: false })
        return
      }

      const demoLimits = message.demoLimits as
        | {
            quotaBytes: number
            maxDocs: number
            maxBlobBytes: number
            evictionTtlMs: number
          }
        | undefined

      setState({
        isDemo: true,
        limits: demoLimits
          ? {
              quotaBytes: demoLimits.quotaBytes,
              maxDocs: demoLimits.maxDocs,
              evictionHours: Math.round(demoLimits.evictionTtlMs / 3600000)
            }
          : undefined
      })
    })

    return unsubscribe
  }, [syncManager])

  return state
}
