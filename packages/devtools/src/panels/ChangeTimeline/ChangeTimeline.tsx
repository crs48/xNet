/**
 * ChangeTimeline panel - Visualize event-sourced changes with Lamport ordering
 */

import { useRef, useEffect, useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { formatTime, truncateCID } from '../../utils/formatters'
import { useChangeTimeline, type TimelineEvent } from './useChangeTimeline'

export function ChangeTimeline() {
  const {
    events,
    selectedEvent,
    setSelectedEvent,
    nodeFilter,
    setNodeFilter,
    typeFilter,
    setTypeFilter,
    autoScroll,
    setAutoScroll
  } = useChangeTimeline()

  const listRef = useRef<HTMLDivElement>(null)
  const getEventsData = useCallback(() => events, [events])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [events.length, autoScroll])

  return (
    <div className="flex h-full">
      {/* Timeline list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
          <input
            type="text"
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            placeholder="Filter by node ID..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={typeFilter || ''}
            onChange={(e) => setTypeFilter(e.target.value || null)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200"
          >
            <option value="">All types</option>
            <option value="store:create">create</option>
            <option value="store:update">update</option>
            <option value="store:delete">delete</option>
            <option value="store:restore">restore</option>
            <option value="store:remote-change">remote</option>
            <option value="store:conflict">conflict</option>
          </select>
          <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            Auto-scroll
          </label>
          <span className="text-[10px] text-zinc-500">{events.length} changes</span>
          <CopyButton getData={getEventsData} label="Copy Changes" />
        </div>

        {/* Event list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
              No store events yet
            </div>
          ) : (
            events.map((event) => (
              <TimelineEntry
                key={event.id}
                event={event}
                isSelected={selectedEvent?.id === event.id}
                onSelect={() => setSelectedEvent(event)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail pane */}
      {selectedEvent && (
        <div className="w-72 border-l border-zinc-800 overflow-y-auto p-3">
          <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        </div>
      )}
    </div>
  )
}

function TimelineEntry({
  event,
  isSelected,
  onSelect
}: {
  event: TimelineEvent
  isSelected: boolean
  onSelect: () => void
}) {
  const isConflict = event.type === 'store:conflict'
  const isRemote = event.type === 'store:remote-change'
  const lamport = 'lamport' in event ? ((event as any).lamport?.time ?? '?') : '?'
  const nodeId = 'nodeId' in event ? (event as any).nodeId : ''

  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2 px-3 py-1 cursor-pointer border-l-2 text-xs
        ${isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'}
        ${isConflict ? 'bg-amber-950/20' : ''}
        ${isRemote ? 'bg-purple-950/20' : ''}
      `}
    >
      <span className="text-[10px] text-zinc-600 w-16 font-mono">{formatTime(event.wallTime)}</span>
      <span className="text-[10px] text-zinc-500 w-8 text-right">L:{lamport}</span>
      <span className={`w-2 h-2 rounded-full ${getDotColor(event.type)}`} />
      <span className="text-[10px] text-zinc-300 w-16">{event.type.split(':')[1]}</span>
      <span className="text-[10px] text-zinc-500 font-mono truncate flex-1">
        {nodeId ? truncateCID(nodeId) : ''}
      </span>
      {isRemote && (
        <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1 rounded">remote</span>
      )}
      {isConflict && (
        <span className="text-[9px] text-amber-400 bg-amber-900/30 px-1 rounded">conflict</span>
      )}
    </div>
  )
}

function EventDetail({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-200">{event.type}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">
          x
        </button>
      </div>
      <pre className="text-[10px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">
        {JSON.stringify(event, null, 2)}
      </pre>
    </div>
  )
}

function getDotColor(type: string): string {
  switch (type) {
    case 'store:create':
      return 'bg-green-400'
    case 'store:update':
      return 'bg-blue-400'
    case 'store:delete':
      return 'bg-red-400'
    case 'store:restore':
      return 'bg-yellow-400'
    case 'store:remote-change':
      return 'bg-purple-400'
    case 'store:conflict':
      return 'bg-amber-400'
    default:
      return 'bg-zinc-400'
  }
}
