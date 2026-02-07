/**
 * Performance optimizations for virtualized table
 */

import type { TableRow } from './useTableState.js'
import { useState, useMemo, useCallback, useRef } from 'react'

// ─── Batched Updates ─────────────────────────────────────────────────────────

/**
 * Hook for batching row loading to prevent excessive re-renders.
 * Useful for progressive loading of large datasets.
 */
export function useBatchedRows<T>(
  items: T[],
  batchSize = 50
): { visibleItems: T[]; loadMore: () => void; hasMore: boolean } {
  const [loaded, setLoaded] = useState(batchSize)

  const visibleItems = useMemo(() => items.slice(0, loaded), [items, loaded])

  const loadMore = useCallback(() => {
    setLoaded((prev) => Math.min(prev + batchSize, items.length))
  }, [items.length, batchSize])

  const hasMore = loaded < items.length

  return { visibleItems, loadMore, hasMore }
}

// ─── Scroll Debounce ─────────────────────────────────────────────────────────

/**
 * Hook for debouncing scroll events using requestAnimationFrame.
 * Reduces virtualization calculations during rapid scrolling.
 */
export function useScrollDebounce() {
  const scrollRef = useRef<number>()

  const handleScroll = useCallback((callback: () => void) => {
    if (scrollRef.current) {
      cancelAnimationFrame(scrollRef.current)
    }
    scrollRef.current = requestAnimationFrame(callback)
  }, [])

  return handleScroll
}

// ─── Row Cache ───────────────────────────────────────────────────────────────

/**
 * LRU cache for row data to limit memory usage.
 * Evicts least recently used rows when capacity is reached.
 */
export class RowCache {
  private cache = new Map<string, TableRow>()
  private maxSize: number

  constructor(maxSize = 10000) {
    this.maxSize = maxSize
  }

  get(id: string): TableRow | undefined {
    const row = this.cache.get(id)
    if (row) {
      // Move to end (most recently used)
      this.cache.delete(id)
      this.cache.set(id, row)
    }
    return row
  }

  set(id: string, row: TableRow): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(id, row)
  }

  has(id: string): boolean {
    return this.cache.has(id)
  }

  delete(id: string): void {
    this.cache.delete(id)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  /**
   * Bulk set rows (useful for initial load)
   */
  setMany(rows: TableRow[]): void {
    for (const row of rows) {
      this.set(row.id, row)
    }
  }

  /**
   * Get multiple rows by IDs
   */
  getMany(ids: string[]): (TableRow | undefined)[] {
    return ids.map((id) => this.get(id))
  }
}

// ─── Cell Renderer Cache ─────────────────────────────────────────────────────

/**
 * Cache for rendered cell values to prevent unnecessary re-creation.
 * Uses a composite key of rowId-columnId-value.
 */
export class CellRendererCache {
  private cache = new Map<string, React.ReactNode>()
  private maxSize: number

  constructor(maxSize = 10000) {
    this.maxSize = maxSize
  }

  private makeKey(rowId: string, columnId: string, value: unknown): string {
    return `${rowId}-${columnId}-${JSON.stringify(value)}`
  }

  get(rowId: string, columnId: string, value: unknown): React.ReactNode | undefined {
    const key = this.makeKey(rowId, columnId, value)
    return this.cache.get(key)
  }

  set(rowId: string, columnId: string, value: unknown, node: React.ReactNode): void {
    const key = this.makeKey(rowId, columnId, value)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, node)
  }

  has(rowId: string, columnId: string, value: unknown): boolean {
    const key = this.makeKey(rowId, columnId, value)
    return this.cache.has(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// ─── Intersection Observer Hook ──────────────────────────────────────────────

/**
 * Hook for detecting when an element enters the viewport.
 * Useful for lazy loading rows or triggering load-more.
 */
export function useIntersectionObserver(
  callback: () => void,
  options?: IntersectionObserverInit
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  // Set up observer on mount
  useMemo(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        callbackRef.current()
      }
    }, options)

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [options])

  return ref
}

// ─── Stable Callback Hook ────────────────────────────────────────────────────

/**
 * Hook that returns a stable callback reference.
 * Useful for preventing unnecessary re-renders in memoized components.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args)
  }, []) as T
}

// ─── Throttle Hook ───────────────────────────────────────────────────────────

/**
 * Hook for throttling a callback to a maximum frequency.
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef(0)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now
        return callbackRef.current(...args)
      }
    },
    [delay]
  ) as T
}
