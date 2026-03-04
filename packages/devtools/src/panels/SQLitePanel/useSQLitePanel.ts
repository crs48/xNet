/**
 * SQLite debug panel hook
 */

import type { DevToolsEventBus } from '../../core/event-bus'
import type { NodeStore } from '@xnetjs/data'
import { useState, useEffect, useCallback } from 'react'

const DEBUG_KEY = 'xnet:sqlite:debug'

export interface SQLiteDebugInfo {
  debugEnabled: boolean
  supportInfo: {
    supported: boolean
    reason?: string
    warning?: string
  } | null
  recentLogs: Array<{
    timestamp: number
    level: 'log' | 'warn' | 'error'
    message: string
  }>
}

export interface SQLiteStatusInfo {
  active: boolean
  health: 'working' | 'degraded' | 'inactive'
  adapter: string
  mode: 'opfs' | 'memory' | 'unknown'
  tooltip: string
}

export function useSQLiteStatus(store: NodeStore | null): SQLiteStatusInfo {
  const [supportWarning, setSupportWarning] = useState<string | null>(null)
  const [storageMode, setStorageMode] = useState<'opfs' | 'memory' | 'unknown'>('unknown')

  useEffect(() => {
    let cancelled = false

    async function checkSupport() {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return
      }

      try {
        const { checkBrowserSupport } = await import('@xnetjs/sqlite')
        const result = await checkBrowserSupport()
        if (!cancelled) {
          setSupportWarning(result.warning ?? null)
        }
      } catch {
        if (!cancelled) {
          setSupportWarning('Unable to verify OPFS support')
        }
      }
    }

    checkSupport()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function inferStorageModeFromPragma(
      sqliteAdapter: unknown
    ): Promise<'opfs' | 'memory' | 'unknown'> {
      const queryAdapter = sqliteAdapter as {
        query?: (sql: string) => Promise<Array<{ name?: string; file?: string | null }>>
      } | null

      if (!queryAdapter || typeof queryAdapter.query !== 'function') {
        return 'unknown'
      }

      try {
        const rows = await queryAdapter.query('PRAGMA database_list')
        const main = rows.find((row) => row.name === 'main')
        const file = (main?.file ?? '').trim()

        if (file === '' || file === ':memory:') {
          return 'memory'
        }

        return 'opfs'
      } catch {
        return 'unknown'
      }
    }

    async function detectStorageMode(): Promise<'opfs' | 'memory' | 'unknown'> {
      if (!store) {
        return 'unknown'
      }

      const storageAdapter = store.getStorageAdapter() as {
        getSQLiteAdapter?: () => unknown
      } | null

      const sqliteAdapter =
        storageAdapter && typeof storageAdapter.getSQLiteAdapter === 'function'
          ? storageAdapter.getSQLiteAdapter()
          : null

      const adapterWithMode = sqliteAdapter as {
        getStorageMode?: () => Promise<'opfs' | 'memory'> | 'opfs' | 'memory'
      } | null

      if (!adapterWithMode || typeof adapterWithMode.getStorageMode !== 'function') {
        const inferredMode = await inferStorageModeFromPragma(sqliteAdapter)
        return inferredMode
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const mode = await Promise.resolve(adapterWithMode.getStorageMode())
          return mode
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 200))
            continue
          }

          const inferredMode = await inferStorageModeFromPragma(sqliteAdapter)
          return inferredMode
        }
      }

      return 'unknown'
    }

    async function runDetection() {
      const mode = await detectStorageMode()
      if (cancelled) {
        return
      }

      setStorageMode(mode)

      // Safari worker/proxy startup can be late; keep retrying until mode is known.
      if (mode === 'unknown') {
        retryTimer = setTimeout(() => {
          runDetection().catch(() => {
            // Ignore transient errors; status stays unknown until next retry.
          })
        }, 1000)
      }
    }

    runDetection().catch(() => {
      if (!cancelled) {
        setStorageMode('unknown')
      }
    })

    return () => {
      cancelled = true
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [store])

  const storage = store?.getStorageAdapter()
  const adapterName =
    (storage as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? 'unknown'
  const isSQLiteAdapter = /sqlite/i.test(adapterName)

  if (!store) {
    return {
      active: false,
      health: 'inactive',
      adapter: 'unavailable',
      mode: 'unknown',
      tooltip: 'SQLite inactive: NodeStore is not connected'
    }
  }

  if (!isSQLiteAdapter) {
    return {
      active: false,
      health: 'inactive',
      adapter: adapterName,
      mode: 'unknown',
      tooltip: `SQLite inactive: active adapter is ${adapterName}`
    }
  }

  // Runtime adapter mode is source-of-truth for health. Browser support warnings
  // are advisory and should not downgrade healthy OPFS runtime.
  const degradedReasons: string[] = []
  if (storageMode !== 'opfs') {
    degradedReasons.push(
      storageMode === 'memory'
        ? 'running with in-memory SQLite fallback'
        : 'unable to confirm OPFS-backed SQLite mode'
    )
    if (supportWarning) {
      degradedReasons.push(supportWarning)
    }
  }

  if (degradedReasons.length > 0) {
    return {
      active: true,
      health: 'degraded',
      adapter: adapterName,
      mode: storageMode,
      tooltip: `SQLite degraded: ${degradedReasons.join(' | ')}`
    }
  }

  return {
    active: true,
    health: 'working',
    adapter: adapterName,
    mode: storageMode,
    tooltip: supportWarning
      ? `SQLite working: ${adapterName} (OPFS). Advisory: ${supportWarning}`
      : `SQLite working: ${adapterName} (OPFS)`
  }
}

export function useSQLitePanel(_eventBus: DevToolsEventBus) {
  const [debugEnabled, setDebugEnabled] = useState(
    typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === 'true'
  )
  const [supportInfo, setSupportInfo] = useState<SQLiteDebugInfo['supportInfo']>(null)
  const [recentLogs, setRecentLogs] = useState<SQLiteDebugInfo['recentLogs']>([])

  // Toggle debug flag
  const toggleDebug = useCallback(() => {
    const newValue = !debugEnabled
    setDebugEnabled(newValue)
    if (typeof localStorage !== 'undefined') {
      if (newValue) {
        localStorage.setItem(DEBUG_KEY, 'true')
      } else {
        localStorage.removeItem(DEBUG_KEY)
      }
    }
  }, [debugEnabled])

  // Check browser support (if in web environment)
  useEffect(() => {
    async function checkSupport() {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return
      }

      try {
        const { checkBrowserSupport } = await import('@xnetjs/sqlite')
        const result = await checkBrowserSupport()
        setSupportInfo({
          supported: result.supported,
          reason: result.reason,
          warning: result.warning
        })
      } catch (err) {
        setSupportInfo({
          supported: false,
          reason: 'Unable to check browser support'
        })
      }
    }

    checkSupport()
  }, [])

  // Intercept console.log/warn/error to capture SQLite debug logs
  useEffect(() => {
    if (!debugEnabled) return

    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    const captureLog = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ')

      // Only capture SQLite-related logs
      if (
        message.includes('[WebSQLiteAdapter]') ||
        message.includes('[SQLite]') ||
        message.includes('OPFS')
      ) {
        setRecentLogs((prev) => [
          ...prev.slice(-99), // Keep last 100 logs
          {
            timestamp: Date.now(),
            level,
            message
          }
        ])
      }
    }

    console.log = (...args: unknown[]) => {
      captureLog('log', args)
      originalLog(...args)
    }

    console.warn = (...args: unknown[]) => {
      captureLog('warn', args)
      originalWarn(...args)
    }

    console.error = (...args: unknown[]) => {
      captureLog('error', args)
      originalError(...args)
    }

    return () => {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [debugEnabled])

  const clearLogs = useCallback(() => {
    setRecentLogs([])
  }, [])

  return {
    debugEnabled,
    toggleDebug,
    supportInfo,
    recentLogs,
    clearLogs
  }
}
