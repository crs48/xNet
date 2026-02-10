/**
 * SQLite Debug Panel - Toggle debug logging and view SQLite-related diagnostics
 */

import { useDevTools } from '../../provider/useDevTools'
import { useSQLitePanel } from './useSQLitePanel'

export function SQLitePanel() {
  const { eventBus } = useDevTools()
  const { debugEnabled, toggleDebug, supportInfo, recentLogs, clearLogs } = useSQLitePanel(eventBus)

  return (
    <div className="h-full flex flex-col bg-zinc-900 text-zinc-200">
      <div className="flex items-center justify-between p-3 border-b border-zinc-700">
        <h2 className="text-sm font-semibold">SQLite Debug</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={toggleDebug}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
            />
            <span>
              Debug Logging
              <span className="ml-1 text-zinc-500">(xnet:sqlite:debug)</span>
            </span>
          </label>
          {recentLogs.length > 0 && (
            <button
              onClick={clearLogs}
              className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded"
            >
              Clear Logs
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {supportInfo && (
          <div className="bg-zinc-800 rounded p-3 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase">Browser Support</h3>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${supportInfo.supported ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span>
                  {supportInfo.supported ? 'Supported' : 'Not Supported'}
                  {supportInfo.reason && (
                    <span className="text-zinc-500 ml-2">({supportInfo.reason})</span>
                  )}
                </span>
              </div>
              {supportInfo.warning && (
                <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-800 rounded text-yellow-300">
                  ⚠️ {supportInfo.warning}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-zinc-800 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase">Recent Logs</h3>
            <span className="text-xs text-zinc-500">{recentLogs.length} entries</span>
          </div>

          {recentLogs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
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
                      ? 'bg-red-900/20 text-red-300'
                      : log.level === 'warn'
                        ? 'bg-yellow-900/20 text-yellow-300'
                        : 'bg-zinc-900 text-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-800 rounded p-3 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase">Debug Controls</h3>
          <div className="text-xs space-y-2">
            <p className="text-zinc-400">To manually toggle debug mode in the console:</p>
            <code className="block bg-zinc-900 p-2 rounded text-green-400">
              localStorage.setItem('xnet:sqlite:debug', 'true')
            </code>
            <code className="block bg-zinc-900 p-2 rounded text-red-400">
              localStorage.removeItem('xnet:sqlite:debug')
            </code>
            <p className="text-zinc-500 mt-2">Reload the page after toggling for full effect.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
