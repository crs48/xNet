/**
 * Logs panel hook — one place to (a) toggle the app's runtime debug channels
 * and (b) capture console output into a searchable ring buffer.
 *
 * The debug channels are the localStorage flags various packages check before
 * logging (sync/sqlite/query/boot/trace). Flipping them here turns that
 * logging on/off live. The capture taps console.* (dev-only, restored on
 * unmount — same approach the SQLite panel already uses) so the flagged output
 * is readable in-app instead of only in the browser console.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error'
export type LogChannel = 'sync' | 'sqlite' | 'query' | 'boot' | 'trace' | 'general'

export interface LogEntry {
  id: number
  level: LogLevel
  channel: LogChannel
  message: string
  at: number
}

export interface DebugChannel {
  key: Exclude<LogChannel, 'general'>
  label: string
  /** localStorage key the producing code reads. */
  flag: string
  /** Value the flag must hold to be "on" (trace uses '1', the rest 'true'). */
  onValue: string
  description: string
}

export const DEBUG_CHANNELS: DebugChannel[] = [
  {
    key: 'sync',
    label: 'Sync',
    flag: 'xnet:sync:debug',
    onValue: 'true',
    description: 'Connection / WebSocket / sync manager'
  },
  {
    key: 'sqlite',
    label: 'SQLite',
    flag: 'xnet:sqlite:debug',
    onValue: 'true',
    description: 'OPFS SQLite adapter'
  },
  {
    key: 'query',
    label: 'Query',
    flag: 'xnet:query:debug',
    onValue: 'true',
    description: 'Query execution'
  },
  {
    key: 'boot',
    label: 'Boot',
    flag: 'xnet:boot:debug',
    onValue: 'true',
    description: 'Boot timeline / read-path probe'
  },
  {
    key: 'trace',
    label: 'Trace',
    flag: 'xnet:trace',
    onValue: '1',
    description: 'Operation trace collector'
  }
]

const MAX_LOGS = 1000
const FLUSH_MS = 300

function readFlag(ch: DebugChannel): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(ch.flag) === ch.onValue
}

function writeFlag(ch: DebugChannel, on: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (on) localStorage.setItem(ch.flag, ch.onValue)
  else localStorage.removeItem(ch.flag)
}

/** Best-effort channel tag from a log message's content. Ordered so the real
 *  emitters bucket correctly: the query-plan line comes from the SQLite adapter
 *  (`[SQLiteNodeStorageAdapter] query plan`), so match "query" before "sqlite";
 *  the WS provider logs `[WSSyncProvider:…]`, which contains "sync". */
export function classifyChannel(message: string): LogChannel {
  const m = message.toLowerCase()
  if (m.includes('query plan') || m.includes('[query') || m.includes('query:')) return 'query'
  if (m.includes('opfs') || m.includes('sqlite')) return 'sqlite'
  if (m.includes('sync') || m.includes('connectionmanager') || m.includes('websocket')) {
    return 'sync'
  }
  if (m.includes('boot')) return 'boot'
  if (m.includes('trace')) return 'trace'
  return 'general'
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

export function useLogsPanel() {
  const [channelState, setChannelState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEBUG_CHANNELS.map((c) => [c.key, readFlag(c)]))
  )
  const [capturing, setCapturing] = useState(true)
  const [paused, setPaused] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')
  const [channelFilter, setChannelFilter] = useState<LogChannel | 'all'>('all')
  const [search, setSearch] = useState('')

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const bufferRef = useRef<LogEntry[]>([])
  const nextIdRef = useRef(0)
  const dirtyRef = useRef(false)

  const setChannel = useCallback((key: string, on: boolean) => {
    const ch = DEBUG_CHANNELS.find((c) => c.key === key)
    if (!ch) return
    writeFlag(ch, on)
    setChannelState((prev) => ({ ...prev, [key]: on }))
  }, [])

  // Console tap — patched while capturing, restored on unmount/disable.
  useEffect(() => {
    if (!capturing || typeof console === 'undefined') return
    const levels: LogLevel[] = ['debug', 'log', 'info', 'warn', 'error']
    const originals = {} as Record<LogLevel, (...args: unknown[]) => void>

    for (const level of levels) {
      originals[level] = console[level] as (...args: unknown[]) => void
      console[level] = (...args: unknown[]) => {
        originals[level](...args)
        if (pausedRef.current) return
        const message = stringifyArgs(args)
        bufferRef.current.push({
          id: nextIdRef.current++,
          level,
          channel: classifyChannel(message),
          message,
          at: Date.now()
        })
        if (bufferRef.current.length > MAX_LOGS) {
          bufferRef.current.splice(0, bufferRef.current.length - MAX_LOGS)
        }
        dirtyRef.current = true
      }
    }

    const flush = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setLogs(bufferRef.current.slice())
    }, FLUSH_MS)

    return () => {
      clearInterval(flush)
      for (const level of levels) {
        console[level] = originals[level]
      }
    }
  }, [capturing])

  const clear = useCallback(() => {
    bufferRef.current = []
    dirtyRef.current = false
    setLogs([])
  }, [])

  const filtered = logs.filter((entry) => {
    if (levelFilter !== 'all' && entry.level !== levelFilter) return false
    if (channelFilter !== 'all' && entry.channel !== channelFilter) return false
    if (search.trim() && !entry.message.toLowerCase().includes(search.trim().toLowerCase())) {
      return false
    }
    return true
  })

  return {
    channels: DEBUG_CHANNELS,
    channelState,
    setChannel,
    capturing,
    setCapturing,
    paused,
    setPaused,
    logs: filtered,
    totalLogs: logs.length,
    clear,
    levelFilter,
    setLevelFilter,
    channelFilter,
    setChannelFilter,
    search,
    setSearch
  }
}
