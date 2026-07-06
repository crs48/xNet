/**
 * Logs panel — toggle debug channels and read captured console output.
 */

import { Tooltip } from '@xnetjs/ui'
import { useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { formatTime } from '../../utils/formatters'
import { useLogsPanel, type LogChannel, type LogEntry, type LogLevel } from './useLogsPanel'

const LEVELS: Array<LogLevel | 'all'> = ['all', 'debug', 'log', 'info', 'warn', 'error']
const CHANNELS: Array<LogChannel | 'all'> = [
  'all',
  'sync',
  'sqlite',
  'query',
  'boot',
  'trace',
  'general'
]

export function LogsPanel() {
  const {
    channels,
    channelState,
    setChannel,
    capturing,
    setCapturing,
    paused,
    setPaused,
    preserve,
    setPreserve,
    logs,
    totalLogs,
    clear,
    levelFilter,
    setLevelFilter,
    channelFilter,
    setChannelFilter,
    search,
    setSearch
  } = useLogsPanel()

  const getLogsData = useCallback(() => logs, [logs])

  // Restored entries always precede live ones; the divider sits between them.
  const lastRestoredIndex = logs.reduce((acc, entry, i) => (entry.restored ? i : acc), -1)

  return (
    <div className="flex flex-col h-full">
      {/* Debug channel toggles */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline flex-wrap">
        <span className="text-[10px] text-ink-3 uppercase tracking-wide font-medium">Debug</span>
        {channels.map((ch) => (
          <Tooltip key={ch.key} content={ch.description} side="bottom" sideOffset={6}>
            <label className="flex items-center gap-1 text-[10px] text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={channelState[ch.key] ?? false}
                onChange={(e) => setChannel(ch.key, e.target.checked)}
                className="w-3 h-3"
              />
              {ch.label}
            </label>
          </Tooltip>
        ))}
        <span className="text-[9px] text-ink-3 ml-1">
          flags persist; producing code logs only while its channel is on
        </span>
      </div>

      {/* Capture controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="flex-1 bg-surface-2 border border-hairline rounded px-2 py-0.5 text-xs text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ring"
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
          className="bg-surface-2 border border-hairline rounded px-1.5 py-0.5 text-[10px] text-ink-1"
          title="Level"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as LogChannel | 'all')}
          className="bg-surface-2 border border-hairline rounded px-1.5 py-0.5 text-[10px] text-ink-1"
          title="Channel"
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => setCapturing(!capturing)}
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            capturing ? 'border-success text-success' : 'border-hairline text-ink-3'
          }`}
          title={capturing ? 'Capturing console output' : 'Capture is off'}
        >
          {capturing ? 'capturing' : 'off'}
        </button>
        <Tooltip
          content="Preserve logs across reloads for this tab's session (snapshots are scrubbed of tokens/emails)"
          side="bottom"
          sideOffset={6}
        >
          <button
            onClick={() => setPreserve(!preserve)}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              preserve ? 'border-success text-success' : 'border-hairline text-ink-3'
            }`}
          >
            preserve
          </button>
        </Tooltip>
        <button
          onClick={() => setPaused(!paused)}
          disabled={!capturing}
          className="text-[10px] text-ink-2 hover:text-ink-1 px-1 disabled:opacity-40"
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? '▶' : '❚❚'}
        </button>
        <button
          onClick={clear}
          className="text-[10px] text-ink-2 hover:text-ink-1 px-1"
          title="Clear"
        >
          clear
        </button>
        <CopyButton getData={getLogsData} label="Copy" />
      </div>

      {/* Captured log stream */}
      <div className="flex-1 overflow-y-auto font-mono">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-3 text-xs gap-1 px-4 text-center">
            <p>{totalLogs === 0 ? 'No logs captured yet.' : 'No logs match the filters.'}</p>
            <p className="text-[10px]">
              Turn on a debug channel above, then reproduce the behavior to see its output here.
            </p>
          </div>
        ) : (
          logs.map((entry, i) => (
            <div key={entry.id}>
              <LogRow entry={entry} />
              {i === lastRestoredIndex && i < logs.length - 1 && <SessionDivider />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SessionDivider() {
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-ink-3 uppercase tracking-wide">
      <span className="flex-1 border-t border-hairline" />
      new session — dimmed entries above were preserved from before the reload
      <span className="flex-1 border-t border-hairline" />
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div
      className={`flex items-start gap-2 px-3 py-0.5 border-b border-hairline/40 hover:bg-surface-2 text-[10px] ${
        entry.restored ? 'opacity-70' : ''
      }`}
    >
      <span className="text-ink-3 shrink-0 w-[72px]">{formatTime(entry.at)}</span>
      <span className={`shrink-0 w-10 font-medium ${levelColor(entry.level)}`}>{entry.level}</span>
      <span className="shrink-0 w-12 text-ink-3">{entry.channel}</span>
      <span className="text-ink-2 break-all whitespace-pre-wrap flex-1">{entry.message}</span>
    </div>
  )
}

function levelColor(level: LogLevel): string {
  switch (level) {
    case 'error':
      return 'text-destructive'
    case 'warn':
      return 'text-warning'
    case 'info':
      return 'text-ink-1'
    default:
      return 'text-ink-3'
  }
}
