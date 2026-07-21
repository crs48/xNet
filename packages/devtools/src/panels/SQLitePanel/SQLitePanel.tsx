/**
 * SQLite Debug Panel - Toggle debug logging and view SQLite-related diagnostics
 */

import { Tooltip } from '@xnetjs/ui'
import { useCallback, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import { buildSqlDump, type QueryFn } from './sql-dump'
import { useBlobStoreStats, useSQLitePanel, useSQLiteStatus } from './useSQLitePanel'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function SQLitePanel() {
  const { eventBus, runtimeStatus, storageDurability, store } = useDevTools()
  const { debugEnabled, toggleDebug, supportInfo, recentLogs, clearLogs } = useSQLitePanel(eventBus)
  const sqliteStatus = useSQLiteStatus(store)
  const sqliteDotClass = getSQLiteHealthDotClass(sqliteStatus.health)
  const [snapshotting, setSnapshotting] = useState(false)
  const blobStats = useBlobStoreStats(store)

  // Tier-2 snapshot (0344): SQL text dump through the adapter's query()
  // surface — restorable with `sqlite3 new.db < dump.sql` by any tool.
  const handleSnapshot = useCallback(async () => {
    if (!store || snapshotting) return
    const storageAdapter = store.getStorageAdapter() as {
      getSQLiteAdapter?: () => unknown
    } | null
    const sqliteAdapter =
      storageAdapter && typeof storageAdapter.getSQLiteAdapter === 'function'
        ? (storageAdapter.getSQLiteAdapter() as { query?: QueryFn } | null)
        : null
    if (!sqliteAdapter || typeof sqliteAdapter.query !== 'function') return
    setSnapshotting(true)
    try {
      const dump = await buildSqlDump(sqliteAdapter.query.bind(sqliteAdapter))
      const url = URL.createObjectURL(new Blob([dump], { type: 'application/sql' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `xnet-snapshot-${new Date().toISOString().slice(0, 10)}.sql`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setSnapshotting(false)
    }
  }, [store, snapshotting])

  return (
    <div className="h-full flex flex-col bg-surface-2 text-ink-1">
      <div className="flex items-center justify-between p-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Tooltip content={sqliteStatus.tooltip} side="bottom" sideOffset={6}>
            <span className="inline-flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${sqliteDotClass}`} />
              <h2 className="text-sm font-semibold">SQLite Debug</h2>
              <span className="text-xs text-ink-3">
                {sqliteStatus.health} ({sqliteStatus.adapter}, {sqliteStatus.mode})
              </span>
            </span>
          </Tooltip>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSnapshot()}
            disabled={!store || snapshotting}
            className="px-2 py-1 text-xs bg-background-emphasis hover:bg-border-emphasis rounded disabled:opacity-50"
            title="Download a SQL text dump of the live database (materialized snapshot for any SQLite tool — not the signed bundle; use Settings → Export data for that)"
          >
            {snapshotting ? 'Dumping…' : 'Snapshot (.sql)'}
          </button>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={toggleDebug}
              className="w-4 h-4 rounded border-border-emphasis bg-background-emphasis accent-accent-ink focus:ring-2 focus:ring-ring"
            />
            <span>
              Debug Logging
              <span className="ml-1 text-ink-3">(xnet:sqlite:debug)</span>
            </span>
          </label>
          {recentLogs.length > 0 && (
            <button
              onClick={clearLogs}
              className="px-2 py-1 text-xs bg-background-emphasis hover:bg-border-emphasis rounded"
            >
              Clear Logs
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div className="bg-background-emphasis rounded p-3 space-y-2">
          <h3 className="text-xs font-semibold text-ink-2 uppercase">Runtime Mode</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-ink-3">Requested</span>
            <span>{runtimeStatus.requestedMode}</span>
            <span className="text-ink-3">Active</span>
            <span>{runtimeStatus.activeMode ?? 'unavailable'}</span>
            <span className="text-ink-3">Phase</span>
            <span>{runtimeStatus.phase}</span>
            <span className="text-ink-3">Fallback</span>
            <span>
              {runtimeStatus.usedFallback ? (runtimeStatus.fallbackMode ?? 'yes') : 'none'}
            </span>
          </div>
          {runtimeStatus.reason && (
            <p className="text-xs text-warning bg-warning-muted border border-warning rounded p-2">
              {runtimeStatus.reason}
            </p>
          )}
        </div>

        {storageDurability && (
          <div className="bg-background-emphasis rounded p-3 space-y-2">
            <h3 className="text-xs font-semibold text-ink-2 uppercase">Persistent Storage</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-ink-3">State</span>
              <span>{storageDurability.state}</span>
              {typeof storageDurability.usageBytes === 'number' && (
                <>
                  <span className="text-ink-3">Usage</span>
                  <span>{formatBytes(storageDurability.usageBytes)}</span>
                </>
              )}
              {typeof storageDurability.quotaBytes === 'number' && (
                <>
                  <span className="text-ink-3">Quota</span>
                  <span>{formatBytes(storageDurability.quotaBytes)}</span>
                </>
              )}
            </div>
            <p className="text-xs text-ink-2">{storageDurability.message}</p>
          </div>
        )}

        {/* Attachment blobs (exploration 0385): file cells and editor uploads
            share this store, and it's the fastest-growing table on a device
            that attaches media. */}
        {blobStats && (
          <div className="bg-background-emphasis rounded p-3 space-y-2">
            <h3 className="text-xs font-semibold text-ink-2 uppercase">Attachment Blobs</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-ink-3">Files</span>
              <span>{blobStats.blobCount.toLocaleString()}</span>
              <span className="text-ink-3">Total size</span>
              <span>{formatBytes(blobStats.blobTotalSize)}</span>
            </div>
          </div>
        )}

        {supportInfo && (
          <div className="bg-background-emphasis rounded p-3 space-y-2">
            <h3 className="text-xs font-semibold text-ink-2 uppercase">Browser Support</h3>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${supportInfo.supported ? 'bg-success' : 'bg-destructive'}`}
                />
                <span>
                  {supportInfo.supported ? 'Supported' : 'Not Supported'}
                  {supportInfo.reason && (
                    <span className="text-ink-3 ml-2">({supportInfo.reason})</span>
                  )}
                </span>
              </div>
              {supportInfo.warning && (
                <div className="mt-2 p-2 bg-warning-muted border border-warning rounded text-warning">
                  ⚠️ {supportInfo.warning}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-background-emphasis rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink-2 uppercase">Recent Logs</h3>
            <span className="text-xs text-ink-3">{recentLogs.length} entries</span>
          </div>

          {recentLogs.length === 0 ? (
            <p className="text-xs text-ink-3 py-4 text-center">
              {debugEnabled
                ? 'No SQLite logs yet. Use the app to trigger SQLite operations.'
                : 'Enable debug logging to see SQLite logs here.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-auto">
              {recentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded font-mono text-xs ${
                    log.level === 'error'
                      ? 'bg-destructive-muted text-destructive'
                      : log.level === 'warn'
                        ? 'bg-warning-muted text-warning'
                        : 'bg-surface-2 text-ink-2'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-ink-3 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-background-emphasis rounded p-3 space-y-2">
          <h3 className="text-xs font-semibold text-ink-2 uppercase">Debug Controls</h3>
          <div className="text-xs space-y-2">
            <p className="text-ink-2">To manually toggle debug mode in the console:</p>
            <code className="block bg-surface-2 p-2 rounded text-success">
              localStorage.setItem('xnet:sqlite:debug', 'true')
            </code>
            <code className="block bg-surface-2 p-2 rounded text-destructive">
              localStorage.removeItem('xnet:sqlite:debug')
            </code>
            <p className="text-ink-3 mt-2">Reload the page after toggling for full effect.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function getSQLiteHealthDotClass(health: 'working' | 'degraded' | 'inactive'): string {
  switch (health) {
    case 'working':
      return 'bg-success'
    case 'degraded':
      return 'bg-warning'
    case 'inactive':
      return 'bg-destructive'
  }
}
