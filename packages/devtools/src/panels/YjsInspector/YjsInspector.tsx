/**
 * YjsInspector panel - Y.Doc updates, size metrics, local vs remote
 */

import { useYjsInspector, type DocStats, type YjsEvent } from './useYjsInspector'
import { formatBytes, formatTime, relativeTime } from '../../utils/formatters'

export function YjsInspector() {
  const { events, docStats, selectedDoc, setSelectedDoc } = useYjsInspector()

  return (
    <div className="flex h-full">
      {/* Doc list */}
      <div className="w-56 border-r border-zinc-800 overflow-y-auto shrink-0">
        <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">
          Documents ({docStats.length})
        </div>
        <button
          onClick={() => setSelectedDoc(null)}
          className={`w-full text-left px-2 py-1 text-[10px] ${!selectedDoc ? 'bg-zinc-800 text-blue-400' : 'text-zinc-400 hover:bg-zinc-900'}`}
        >
          All ({events.length} events)
        </button>
        {docStats.map((doc) => (
          <DocRow
            key={doc.docId}
            doc={doc}
            isSelected={selectedDoc === doc.docId}
            onSelect={() => setSelectedDoc(doc.docId)}
          />
        ))}
      </div>

      {/* Event log */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">
          Updates ({events.length})
        </div>
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
            No Yjs events yet
          </div>
        ) : (
          events.map((event) => <YjsEventRow key={event.id} event={event} />)
        )}
      </div>
    </div>
  )
}

function DocRow({
  doc,
  isSelected,
  onSelect
}: {
  doc: DocStats
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`px-2 py-1.5 cursor-pointer text-[10px] ${isSelected ? 'bg-zinc-800 border-l-2 border-blue-400' : 'hover:bg-zinc-900 border-l-2 border-transparent'}`}
    >
      <div className="font-mono text-zinc-300 truncate">{doc.docId.slice(0, 16)}</div>
      <div className="flex items-center gap-2 text-zinc-500 mt-0.5">
        <span>{doc.updateCount} updates</span>
        <span>{formatBytes(doc.totalBytes)}</span>
      </div>
      <div className="flex items-center gap-2 text-zinc-600 mt-0.5">
        <span>L:{doc.localUpdates}</span>
        <span>R:{doc.remoteUpdates}</span>
        <span>{relativeTime(doc.lastUpdate)}</span>
      </div>
    </div>
  )
}

function YjsEventRow({ event }: { event: YjsEvent }) {
  if (event.type === 'yjs:update') {
    return (
      <div className="flex items-center gap-2 px-2 py-0.5 text-[10px]">
        <span className="text-zinc-600 w-16 font-mono">{formatTime(event.wallTime)}</span>
        <span
          className={`w-2 h-2 rounded-full ${event.isLocal ? 'bg-blue-400' : 'bg-purple-400'}`}
        />
        <span className="text-zinc-400 w-12">{event.isLocal ? 'local' : 'remote'}</span>
        <span className="text-zinc-500 font-mono truncate">{event.docId.slice(0, 12)}</span>
        <span className="text-zinc-500 ml-auto">{formatBytes(event.updateSize)}</span>
        {event.origin && <span className="text-zinc-600 truncate max-w-20">{event.origin}</span>}
      </div>
    )
  }

  // meta-change
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-[10px]">
      <span className="text-zinc-600 w-16 font-mono">{formatTime(event.wallTime)}</span>
      <span className="w-2 h-2 rounded-full bg-yellow-400" />
      <span className="text-zinc-400 w-12">meta</span>
      <span className="text-zinc-500 font-mono truncate">{event.docId.slice(0, 12)}</span>
      <span className="text-zinc-500 ml-auto truncate">{event.keysChanged.join(', ')}</span>
    </div>
  )
}
