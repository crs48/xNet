/**
 * Logs panel hook — one place to (a) toggle the app's runtime debug channels
 * and (b) read the captured console output.
 *
 * The debug channels are the localStorage flags various packages check before
 * logging (sync/sqlite/query/boot/trace). Flipping them here turns that
 * logging on/off live. The capture itself lives on the provider
 * (ConsoleLogStore + instrumentConsole, exploration 0275) so logs keep
 * accumulating while this tab — or the whole dock — is closed; this hook is a
 * pure view: filters, search, and the capture/pause/preserve controls.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export type { LogChannel, LogEntry, LogLevel } from '../../core/log-store'
export { classifyChannel } from '../../core/log-store'
import type { LogChannel, LogEntry, LogLevel } from '../../core/log-store'

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

export function useLogsPanel() {
  const { consoleLogs } = useDevTools()

  const [channelState, setChannelState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEBUG_CHANNELS.map((c) => [c.key, readFlag(c)]))
  )
  const [capturing, setCapturingState] = useState(consoleLogs.capturing)
  const [paused, setPausedState] = useState(consoleLogs.paused)
  const [preserve, setPreserveState] = useState(consoleLogs.preserveEnabled)
  const [logs, setLogs] = useState<LogEntry[]>(() => consoleLogs.getEntries())
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')
  const [channelFilter, setChannelFilter] = useState<LogChannel | 'all'>('all')
  const [search, setSearch] = useState('')

  const dirtyRef = useRef(false)

  const setChannel = useCallback((key: string, on: boolean) => {
    const ch = DEBUG_CHANNELS.find((c) => c.key === key)
    if (!ch) return
    writeFlag(ch, on)
    setChannelState((prev) => ({ ...prev, [key]: on }))
  }, [])

  // View subscription — the store keeps capturing while unmounted; here we
  // just batch its updates into React state every FLUSH_MS.
  useEffect(() => {
    setLogs(consoleLogs.getEntries())
    const unsubscribe = consoleLogs.subscribe(() => {
      dirtyRef.current = true
    })
    const flush = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setLogs(consoleLogs.getEntries())
    }, FLUSH_MS)

    return () => {
      unsubscribe()
      clearInterval(flush)
    }
  }, [consoleLogs])

  const setCapturing = useCallback(
    (on: boolean) => {
      consoleLogs.capturing = on
      setCapturingState(on)
    },
    [consoleLogs]
  )

  const setPaused = useCallback(
    (on: boolean) => {
      consoleLogs.paused = on
      setPausedState(on)
    },
    [consoleLogs]
  )

  const setPreserve = useCallback(
    (on: boolean) => {
      consoleLogs.setPreserve(on)
      setPreserveState(on)
    },
    [consoleLogs]
  )

  const clear = useCallback(() => {
    consoleLogs.clear()
    dirtyRef.current = false
    setLogs([])
  }, [consoleLogs])

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
    preserve,
    setPreserve,
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
