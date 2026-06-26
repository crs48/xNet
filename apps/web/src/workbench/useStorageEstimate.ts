/**
 * useStorageEstimate — coarse OPFS/IndexedDB storage pressure (exploration
 * 0233). Wraps `navigator.storage.estimate()` so the status bar can warn
 * before the browser evicts local-first data.
 *
 * Treat the numbers as a *pressure hint*, not an accountant: browsers report
 * padded, quantized values and Safari under-reports. The bar only shows the
 * storage chip past a threshold, so a fuzzy estimate is fine.
 */
import { useEffect, useState } from 'react'

export interface StorageEstimate {
  /** Bytes used by this origin (approximate). */
  usage: number
  /** Bytes available to this origin (approximate). */
  quota: number
  /** usage / quota, clamped to 0..1. */
  ratio: number
  /** Whether storage is persisted (won't be evicted under pressure). */
  persisted: boolean
}

/**
 * Polls the storage estimate on an interval. Returns null when the API is
 * unavailable (older Safari, non-secure contexts) or before the first read.
 */
export function useStorageEstimate(pollMs = 30_000): StorageEstimate | null {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
    let alive = true

    const read = async (): Promise<void> => {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        const persisted = (await navigator.storage.persisted?.()) ?? false
        if (!alive) return
        const ratio = quota > 0 ? Math.min(1, usage / quota) : 0
        setEstimate({ usage, quota, ratio, persisted })
      } catch {
        // Estimate is best-effort; a failure just leaves the chip hidden.
      }
    }

    void read()
    const interval = setInterval(() => void read(), pollMs)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [pollMs])

  return estimate
}
