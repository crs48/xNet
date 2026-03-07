/**
 * SyncMonitor panel - P2P connection status, peer list, sync events
 */

import { useState, useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { useDevTools } from '../../provider/useDevTools'
import { formatTime, relativeTime } from '../../utils/formatters'
import { useSyncMonitor, type SyncEvent, type PeerEntry } from './useSyncMonitor'

const SYNC_DEBUG_KEY = 'xnet:sync:debug'

function useSyncDebugLogging() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(SYNC_DEBUG_KEY) === 'true'
  })

  const toggle = useCallback(() => {
    const newValue = !enabled
    setEnabled(newValue)
    if (typeof localStorage !== 'undefined') {
      if (newValue) {
        localStorage.setItem(SYNC_DEBUG_KEY, 'true')
      } else {
        localStorage.removeItem(SYNC_DEBUG_KEY)
      }
    }
    // Log to console so user knows it changed
    console.log(`[xNet] Sync debug logging ${newValue ? 'enabled' : 'disabled'}`)

    // Also toggle BSM debug logging if available (Electron only)
    if (typeof window !== 'undefined' && 'xnetBSM' in window) {
      const xnetBSM = (window as { xnetBSM?: { setDebug?: (enabled: boolean) => void } }).xnetBSM
      xnetBSM?.setDebug?.(newValue)
    }
  }, [enabled])

  return { enabled, toggle }
}

export function SyncMonitor() {
  const { syncDiagnostics } = useDevTools()
  const { events, peers, connectionStatus, stats } = useSyncMonitor()
  const { enabled: debugEnabled, toggle: toggleDebug } = useSyncDebugLogging()

  const getEventsData = useCallback(
    () => ({ events, peers, connectionStatus, stats, syncDiagnostics }),
    [events, peers, connectionStatus, stats, syncDiagnostics]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-zinc-800 shrink-0">
        <StatusIndicator status={connectionStatus} />
        <span className="text-xs text-zinc-400">
          {peers.filter((p) => p.status === 'connected').length} peers connected
        </span>
        <span className="text-xs text-zinc-500">Lifecycle: {syncDiagnostics.lifecyclePhase}</span>
        <span className="text-xs text-zinc-500">Queue: {syncDiagnostics.queueSize}</span>
        <span className="text-xs text-zinc-500">Tracked: {syncDiagnostics.trackedCount}</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-zinc-500">
          <span>Sent: {stats.sent}</span>
          <span>Recv: {stats.received}</span>
          <span className={stats.errors > 0 ? 'text-red-400' : ''}>Errors: {stats.errors}</span>
          <button
            onClick={toggleDebug}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              debugEnabled
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
            }`}
            title={debugEnabled ? 'Disable sync debug logging' : 'Enable sync debug logging'}
          >
            {debugEnabled ? 'Debug ON' : 'Debug OFF'}
          </button>
          <CopyButton getData={getEventsData} label="Copy Events" />
        </div>
      </div>
      {syncDiagnostics.lastVerificationFailure && (
        <div className="px-3 py-2 border-b border-zinc-800 bg-red-950/20 text-[10px] text-red-300">
          Rejected replication for {syncDiagnostics.lastVerificationFailure.nodeId}:{' '}
          {syncDiagnostics.lastVerificationFailure.reason}
          {syncDiagnostics.lastVerificationFailure.sender
            ? ` from ${syncDiagnostics.lastVerificationFailure.sender}`
            : ''}
        </div>
      )}

      {/* Main content: peers + event log */}
      <div className="flex-1 flex overflow-hidden">
        {/* Peer list */}
        <div className="w-48 border-r border-zinc-800 overflow-y-auto shrink-0">
          <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">
            Peers ({peers.length})
          </div>
          {peers.map((peer) => (
            <PeerRow key={peer.id} peer={peer} />
          ))}
          {peers.length === 0 && (
            <div className="px-2 py-4 text-[10px] text-zinc-600 text-center">No peers</div>
          )}
        </div>

        {/* Event log */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">
            Sync Events ({events.length})
          </div>
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
              No sync events yet
            </div>
          ) : (
            events.map((event) => <SyncEventRow key={event.id} event={event} />)
          )}
        </div>
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-green-400',
    synced: 'bg-green-400',
    connecting: 'bg-yellow-400 animate-pulse',
    syncing: 'bg-blue-400 animate-pulse',
    disconnected: 'bg-zinc-500',
    error: 'bg-red-400'
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-zinc-500'}`} />
      <span className="text-xs text-zinc-300">{status}</span>
    </div>
  )
}

function PeerRow({ peer }: { peer: PeerEntry }) {
  const isConnected = peer.status === 'connected'
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[10px]">
      <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-zinc-600'}`} />
      <span className={`font-mono truncate ${isConnected ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {peer.name || peer.id.slice(0, 12)}
      </span>
      <span className="ml-auto text-zinc-600">{relativeTime(peer.connectedAt)}</span>
    </div>
  )
}

function SyncEventRow({ event }: { event: SyncEvent }) {
  const typeLabel = event.type.split(':')[1]
  const isError = event.type === 'sync:error'

  // Build detail string based on event type
  let detail = ''
  if (event.type === 'sync:status-change') {
    detail = `${event.previousStatus} → ${event.newStatus}`
  } else if ('room' in event) {
    detail = event.room
  }
  if ('peerId' in event && (event as any).peerId) {
    detail += ` peer:${(event as any).peerId.slice(0, 8)}`
  }
  if ('peer' in event && (event as any).peer?.id) {
    detail += ` peer:${(event as any).peer.id.slice(0, 8)}`
  }
  if ('error' in event) {
    detail += ` ${(event as any).error}`
  }

  return (
    <div
      className={`flex items-center gap-2 px-2 py-0.5 text-[10px] ${isError ? 'bg-red-950/20' : ''}`}
    >
      <span className="text-zinc-600 w-16 font-mono">{formatTime(event.wallTime)}</span>
      <span className={`w-20 ${isError ? 'text-red-400' : 'text-zinc-400'}`}>{typeLabel}</span>
      <span className="text-zinc-500 truncate flex-1">{detail}</span>
    </div>
  )
}
