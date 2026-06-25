/**
 * Live samplers for the Performance panel: frame rate, JS heap, storage
 * stats, and active-query activity. Each is a small self-contained hook so the
 * panel can compose them and each starts/stops cleanly with the panel mount.
 */

import type { StorageDurabilityInfo } from '../../provider/DevToolsContext'
import { useEffect, useRef, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export interface FrameStats {
  fps: number
  frameMs: number
}

/** Rolling FPS / average frame time via requestAnimationFrame. */
export function useFrameRate(): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ fps: 0, frameMs: 0 })
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return
    let raf = 0
    let last = performance.now()
    let frames = 0
    let acc = 0
    const tick = (t: number) => {
      const dt = t - last
      last = t
      frames++
      acc += dt
      if (acc >= 500) {
        setStats({
          fps: Math.round((frames * 1000) / acc),
          frameMs: Number((acc / frames).toFixed(1))
        })
        frames = 0
        acc = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return stats
}

/**
 * Rolling ring of recent per-frame durations with wall-clock timestamps, for the
 * frame-time (jank) heat map. The frame-rate hook keeps no history; this one does.
 * rAF only ticks while the tab/panel is foregrounded, so the ring naturally
 * reflects the active session (gaps when backgrounded are expected).
 */
export function useFrameRing(capacity = 600): { t: number; v: number }[] {
  const [samples, setSamples] = useState<{ t: number; v: number }[]>([])
  const ring = useRef<{ t: number; v: number }[]>([])
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return
    let raf = 0
    let last = performance.now()
    let sinceFlush = 0
    const tick = (now: number) => {
      const dt = now - last
      last = now
      ring.current.push({ t: Date.now(), v: Number(dt.toFixed(1)) })
      if (ring.current.length > capacity) ring.current.shift()
      // Flush to React ~3x/sec; per-frame setState would itself cause jank.
      sinceFlush += dt
      if (sinceFlush >= 333) {
        sinceFlush = 0
        setSamples(ring.current.slice())
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [capacity])
  return samples
}

export interface HeapStats {
  usedBytes: number
  limitBytes: number
}

/** JS heap usage via the non-standard, Chromium-only performance.memory. */
export function useHeap(): HeapStats | null {
  const [heap, setHeap] = useState<HeapStats | null>(null)
  useEffect(() => {
    const mem = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
      }
    ).memory
    if (!mem) return
    const read = () => setHeap({ usedBytes: mem.usedJSHeapSize, limitBytes: mem.jsHeapSizeLimit })
    read()
    const id = setInterval(read, 1000)
    return () => clearInterval(id)
  }, [])
  return heap
}

export interface StorageStats {
  nodeCount: number | null
  lamport: number | null
  storageDurability: StorageDurabilityInfo | null
}

/** Node count + last lamport from the storage adapter, refreshed periodically. */
export function useStorageStats(): StorageStats {
  const { store, storageDurability } = useDevTools()
  const [stats, setStats] = useState<{ nodeCount: number | null; lamport: number | null }>({
    nodeCount: null,
    lamport: null
  })
  useEffect(() => {
    if (!store) return
    let cancelled = false
    const read = async () => {
      try {
        const adapter = store.getStorageAdapter()
        const [nodeCount, lamport] = await Promise.all([
          adapter.countNodes(),
          adapter.getLastLamportTime()
        ])
        if (!cancelled) setStats({ nodeCount, lamport })
      } catch {
        // ignore transient adapter errors
      }
    }
    read()
    const id = setInterval(read, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [store])
  return { ...stats, storageDurability }
}

export interface ActiveQuery {
  id: string
  type: string
  schemaId: string
  mode: string
  source?: string
  updateCount: number
  resultCount: number
  plan?: { strategy?: string } | null
}

/** Active query/mutation hooks via the provider's diagnostics bridge. */
export function useActiveQueries(): ActiveQuery[] {
  const [queries, setQueries] = useState<ActiveQuery[]>([])
  const ref = useRef<ActiveQuery[]>([])
  ref.current = queries
  useEffect(() => {
    const read = () => {
      const diag = (
        window as unknown as {
          __xnetDevToolsDiagnostics?: { getActiveQueries?: () => ActiveQuery[] } | null
        }
      ).__xnetDevToolsDiagnostics
      if (!diag?.getActiveQueries) return
      try {
        setQueries(diag.getActiveQueries())
      } catch {
        // ignore
      }
    }
    read()
    const id = setInterval(read, 1000)
    return () => clearInterval(id)
  }, [])
  return queries
}
