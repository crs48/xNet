/**
 * useVerification - React hook for cryptographic chain verification
 *
 * Runs verification on a node's change history and reports
 * validity, errors, and statistics.
 *
 * @example
 * ```tsx
 * const { verify, result, loading } = useVerification(nodeId)
 *
 * await verify()
 * if (result?.valid) {
 *   console.log('Chain is valid!', result.stats)
 * } else {
 *   console.log('Errors:', result?.errors)
 * }
 * ```
 */

import { useState, useCallback, useRef } from 'react'
import type { NodeId, NodeStorageAdapter } from '@xnet/data'
import {
  VerificationEngine,
  type VerificationResult,
  type VerificationOptions
} from '@xnet/history'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseVerificationResult {
  /** Run full verification */
  verify: (options?: VerificationOptions) => Promise<void>
  /** Run quick check (hash + chain only) */
  quickCheck: () => Promise<{ valid: boolean; errors: number } | null>
  /** Latest verification result */
  result: VerificationResult | null
  /** Whether verification is running */
  loading: boolean
  /** Verification progress (0-1) */
  progress: number
  /** Any error */
  error: Error | null
}

// ─── Hook ────────────────────────────────────────────────────

export function useVerification(nodeId: NodeId | null): UseVerificationResult {
  const { store } = useNodeStore()
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  const engineRef = useRef<{ engine: VerificationEngine; storage: NodeStorageAdapter } | null>(null)

  const getEngine = useCallback((): VerificationEngine | null => {
    if (!store) return null
    const storage = (store as any).storage as NodeStorageAdapter | undefined
    if (!storage) return null

    if (!engineRef.current || engineRef.current.storage !== storage) {
      engineRef.current = { engine: new VerificationEngine(storage), storage }
    }
    return engineRef.current.engine
  }, [store])

  const verify = useCallback(
    async (options?: VerificationOptions) => {
      if (!nodeId) return
      const engine = getEngine()
      if (!engine) return

      setLoading(true)
      setProgress(0)
      setError(null)
      try {
        const verifyResult = await engine.verifyNodeHistory(nodeId, {
          ...options,
          onProgress: (p) => {
            setProgress(p)
            options?.onProgress?.(p)
          }
        })
        setResult(verifyResult)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
        setProgress(1)
      }
    },
    [nodeId, getEngine]
  )

  const quickCheck = useCallback(async (): Promise<{ valid: boolean; errors: number } | null> => {
    if (!nodeId) return null
    const engine = getEngine()
    if (!engine) return null

    try {
      return await engine.quickCheck(nodeId)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      return null
    }
  }, [nodeId, getEngine])

  return { verify, quickCheck, result, loading, progress, error }
}
