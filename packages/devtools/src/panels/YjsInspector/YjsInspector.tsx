/**
 * YjsInspector panel - Y.Doc structure, state vectors, and update events
 */

import { useState } from 'react'
import {
  useYjsInspector,
  type DocStats,
  type YjsEvent,
  type YjsSubView,
  type YTreeNode,
  type StateVectorEntry
} from './useYjsInspector'
import { formatBytes, formatTime, relativeTime } from '../../utils/formatters'

export function YjsInspector() {
  const {
    events,
    docStats,
    selectedDoc,
    setSelectedDoc,
    subView,
    setSubView,
    docTree,
    stateVector,
    refreshTree,
    refreshStateVector
  } = useYjsInspector()

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

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-view tabs */}
        <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800">
          <SubViewTab id="events" active={subView} onClick={setSubView} label="Updates" />
          <SubViewTab
            id="structure"
            active={subView}
            onClick={setSubView}
            label="Structure"
            disabled={!selectedDoc}
          />
          <SubViewTab
            id="state-vectors"
            active={subView}
            onClick={setSubView}
            label="State Vectors"
            disabled={!selectedDoc}
          />
          {subView === 'structure' && selectedDoc && (
            <button
              onClick={refreshTree}
              className="ml-auto text-[9px] text-zinc-500 hover:text-zinc-300 px-1"
              title="Refresh tree"
            >
              Refresh
            </button>
          )}
          {subView === 'state-vectors' && selectedDoc && (
            <button
              onClick={refreshStateVector}
              className="ml-auto text-[9px] text-zinc-500 hover:text-zinc-300 px-1"
              title="Refresh state vector"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Sub-view content */}
        <div className="flex-1 overflow-y-auto">
          {subView === 'events' && <EventsView events={events} />}
          {subView === 'structure' && <StructureView tree={docTree} selectedDoc={selectedDoc} />}
          {subView === 'state-vectors' && (
            <StateVectorView entries={stateVector} selectedDoc={selectedDoc} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-View Tab ──────────────────────────────────────────

function SubViewTab({
  id,
  active,
  onClick,
  label,
  disabled
}: {
  id: YjsSubView
  active: YjsSubView
  onClick: (view: YjsSubView) => void
  label: string
  disabled?: boolean
}) {
  const isActive = id === active
  return (
    <button
      onClick={() => !disabled && onClick(id)}
      disabled={disabled}
      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
        disabled
          ? 'text-zinc-700 cursor-not-allowed'
          : isActive
            ? 'bg-zinc-700 text-zinc-200'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Events View ───────────────────────────────────────────

function EventsView({ events }: { events: YjsEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
        No Yjs events yet
      </div>
    )
  }

  return (
    <div>
      <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">
        Updates ({events.length})
      </div>
      {events.map((event) => (
        <YjsEventRow key={event.id} event={event} />
      ))}
    </div>
  )
}

// ─── Structure View ────────────────────────────────────────

function StructureView({ tree, selectedDoc }: { tree: YTreeNode[]; selectedDoc: string | null }) {
  if (!selectedDoc) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-[10px]">
        Select a document to view its structure
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-[10px]">
        No shared types found in this document
      </div>
    )
  }

  return (
    <div className="p-1">
      {tree.map((node) => (
        <TreeNodeView key={node.key} node={node} depth={0} />
      ))}
    </div>
  )
}

function TreeNodeView({ node, depth }: { node: YTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const indent = depth * 12

  const typeColors: Record<string, string> = {
    Map: 'text-blue-400',
    Array: 'text-green-400',
    Text: 'text-yellow-400',
    XmlFragment: 'text-purple-400',
    XmlElement: 'text-pink-400',
    XmlText: 'text-orange-400',
    unknown: 'text-zinc-500'
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 hover:bg-zinc-800/50 rounded cursor-pointer"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <span className="text-[10px] text-zinc-500 w-3">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="w-3" />
        )}

        {/* Key name */}
        <span className="text-[10px] text-zinc-300 font-mono">{node.key}</span>

        {/* Type badge */}
        <span className={`text-[8px] px-1 rounded ${typeColors[node.type] ?? typeColors.unknown}`}>
          {node.type}
        </span>

        {/* Size */}
        {node.size > 0 && <span className="text-[8px] text-zinc-600">({node.size})</span>}

        {/* Value preview */}
        {node.value && (
          <span className="text-[9px] text-zinc-500 truncate ml-1 max-w-48">{node.value}</span>
        )}
      </div>

      {/* Children */}
      {expanded &&
        hasChildren &&
        node.children!.map((child, i) => (
          <TreeNodeView key={`${child.key}-${i}`} node={child} depth={depth + 1} />
        ))}
    </div>
  )
}

// ─── State Vector View ─────────────────────────────────────

function StateVectorView({
  entries,
  selectedDoc
}: {
  entries: StateVectorEntry[]
  selectedDoc: string | null
}) {
  if (!selectedDoc) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-[10px]">
        Select a document to view its state vector
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-[10px]">
        No state vector entries
      </div>
    )
  }

  return (
    <div className="p-2">
      <div className="text-[10px] text-zinc-400 mb-2">
        {entries.length} client{entries.length !== 1 ? 's' : ''} in state vector
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 px-2 py-1 text-[9px] text-zinc-500 font-semibold border-b border-zinc-800">
        <span className="w-24">Client ID</span>
        <span className="w-16 text-right">Clock</span>
        <span className="flex-1">Progress</span>
      </div>

      {/* Entries */}
      {entries.map((entry) => {
        const maxClock = entries.reduce((max, e) => Math.max(max, e.clock), 1)
        const pct = (entry.clock / maxClock) * 100

        return (
          <div
            key={entry.clientId}
            className="flex items-center gap-4 px-2 py-1 border-b border-zinc-800/50 text-[10px]"
          >
            <span className="w-24 font-mono text-zinc-300">{entry.clientId}</span>
            <span className="w-16 text-right font-mono text-zinc-400">{entry.clock}</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Existing Components ───────────────────────────────────

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
