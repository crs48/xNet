/**
 * SQLite debug panel hook
 */

import type { DevToolsEventBus } from '../../core/event-bus'
import type { NodeStore } from '@xnet/data'
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
  adapter: string
  tooltip: string
}

export function useSQLiteStatus(store: NodeStore | null): SQLiteStatusInfo {
  const [supportInfo, setSupportInfo] = useState<{
    supported: boolean
    reason?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkSupport() {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return
      }

      try {
        const { checkBrowserSupport } = await import('@xnet/sqlite')
        const result = await checkBrowserSupport()
        if (!cancelled) {
          setSupportInfo({
            supported: result.supported,
            reason: result.reason
          })
        }
      } catch {
        if (!cancelled) {
          setSupportInfo({
            supported: false,
            reason: 'Unable to check browser support'
          })
        }
      }
    }

    checkSupport()

    return () => {
      cancelled = true
    }
  }, [])

  const storage = (store as unknown as { storage?: unknown } | null)?.storage
  const adapterName =
    (storage as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? 'unknown'
  const isSQLiteAdapter = /sqlite/i.test(adapterName)
  const isSupported = supportInfo?.supported ?? true
  if (!store) {
    return {
      active: false,
      adapter: 'unavailable',
      tooltip: 'SQLite inactive: NodeStore is not connected'
    }
  }

  if (!isSQLiteAdapter) {
    return {
      active: false,
      adapter: adapterName,
      tooltip: `SQLite inactive: active adapter is ${adapterName}`
    }
  }

  if (!isSupported) {
    return {
      active: false,
      adapter: adapterName,
      tooltip: `SQLite inactive: ${supportInfo?.reason ?? 'browser support check failed'}`
    }
  }

  return {
    active: true,
    adapter: adapterName,
    tooltip: `SQLite active: ${adapterName}`
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
        const { checkBrowserSupport } = await import('@xnet/sqlite')
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
