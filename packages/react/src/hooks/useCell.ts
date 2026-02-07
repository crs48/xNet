/**
 * useCell - Hook for individual cell editing with debounced saves
 *
 * Provides:
 * - Cell value with optimistic updates
 * - Debounced persistence
 * - Clear operation
 *
 * @example
 * ```tsx
 * const { value, setValue, saving } = useCell<string>(rowId, 'title')
 *
 * return (
 *   <Input
 *     value={value ?? ''}
 *     onChange={(e) => setValue(e.target.value)}
 *     className={saving ? 'opacity-50' : ''}
 *   />
 * )
 * ```
 */

import type { CellValue } from '@xnet/data'
import { updateCell, cellKey } from '@xnet/data'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseCellResult<T extends CellValue = CellValue> {
  /** Cell value */
  value: T | null

  /** Update cell value (debounced save) */
  setValue: (value: T | null) => void

  /** Clear cell value */
  clear: () => void

  /** Whether cell is being saved */
  saving: boolean

  /** Error from last save */
  error: Error | null
}

export interface UseCellOptions {
  /** Debounce delay in ms (default: 300) */
  debounce?: number
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for individual cell editing with debounced saves.
 */
export function useCell<T extends CellValue = CellValue>(
  rowId: string,
  columnId: string,
  options: UseCellOptions = {}
): UseCellResult<T> {
  const { store, isReady } = useNodeStore()
  const { debounce: debounceMs = 300 } = options

  const [value, setValue] = useState<T | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Keep store ref for callbacks
  const storeRef = useRef(store)
  storeRef.current = store

  // Load initial value
  useEffect(() => {
    if (!store || !isReady || !rowId) return

    store.get(rowId).then((node) => {
      if (node) {
        const key = cellKey(columnId)
        setValue((node.properties[key] as T) ?? null)
      }
    })
  }, [store, isReady, rowId, columnId])

  // Subscribe to changes
  useEffect(() => {
    if (!store || !rowId) return

    const unsubscribe = store.subscribe((event) => {
      if (event.change.payload.nodeId === rowId && event.node) {
        const key = cellKey(columnId)
        setValue((event.node.properties[key] as T) ?? null)
      }
    })

    return unsubscribe
  }, [store, rowId, columnId])

  // Set value with debounced save
  const handleSetValue = useCallback(
    (newValue: T | null) => {
      // Optimistic update
      setValue(newValue)
      setError(null)

      // Cancel pending save
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      // Debounce save
      debounceRef.current = setTimeout(async () => {
        if (!storeRef.current) return

        try {
          setSaving(true)
          await updateCell(storeRef.current, rowId, columnId, newValue)
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
          setSaving(false)
        }
      }, debounceMs)
    },
    [rowId, columnId, debounceMs]
  )

  // Clear value
  const clear = useCallback(() => {
    handleSetValue(null)
  }, [handleSetValue])

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return {
    value,
    setValue: handleSetValue,
    clear,
    saving,
    error
  }
}
