/**
 * YjsInspector panel - Y.Doc structure, state vectors, and update events
 */

import { useState, useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { formatBytes, formatTime, relativeTime } from '../../utils/formatters'
import {
  useYjsInspector,
  type DocStats,
  type YjsEvent,
  type YjsSubView,
  type YTreeNode,
  type StateVectorEntry
} from './useYjsInspector'

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

  const getEventsData = useCallback(
    () => ({ events, docStats, stateVector }),
    [events, docStats, stateVector]
  )

  return (
    <div className="flex h-full">
      {/* Doc list */}
      <div className="w-56 border-r border-hairline overflow-y-auto shrink-0">
        <div className="px-2 py-1 text-[10px] font-bold text-ink-3 border-b border-hairline">
          Documents ({docStats.length})
        </div>
        <button
          onClick={() => setSelectedDoc(null)}
          className={`w-full text-left px-2 py-1 text-[10px] ${!selectedDoc ? 'bg-background-emphasis text-ink-1' : 'text-ink-2 hover:bg-accent'}`}
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
        <div className="flex items-center gap-1 px-2 py-1 border-b border-hairline">
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
              className="ml-auto text-[9px] text-ink-3 hover:text-ink-1 px-1"
              title="Refresh tree"
            >
              Refresh
            </button>
          )}
          {subView === 'state-vectors' && selectedDoc && (
            <button
              onClick={refreshStateVector}
              className="ml-auto text-[9px] text-ink-3 hover:text-ink-1 px-1"
              title="Refresh state vector"
            >
              Refresh
            </button>
          )}
          <CopyButton getData={getEventsData} label="Copy Events" />
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
          ? 'text-foreground-faint cursor-not-allowed'
          : isActive
            ? 'bg-background-emphasis text-ink-1'
            : 'text-ink-3 hover:text-ink-1 hover:bg-accent'
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
      <div className="flex items-center justify-center h-32 text-ink-3 text-xs">
        No Yjs events yet
      </div>
    )
  }

  return (
    <div>
      <div className="px-2 py-1 text-[10px] font-bold text-ink-3 border-b border-hairline">
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
      <div className="flex items-center justify-center h-32 text-ink-3 text-[10px]">
        Select a document to view its structure
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-3 text-[10px]">
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
    Map: 'text-ink-2',
    Array: 'text-ink-2',
    Text: 'text-ink-2',
    XmlFragment: 'text-ink-2',
    XmlElement: 'text-ink-2',
    XmlText: 'text-ink-2',
    unknown: 'text-ink-3'
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 hover:bg-accent rounded cursor-pointer"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <span className="text-[10px] text-ink-3 w-3">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="w-3" />
        )}

        {/* Key name */}
        <span className="text-[10px] text-ink-2 font-mono">{node.key}</span>

        {/* Type badge */}
        <span className={`text-[8px] px-1 rounded ${typeColors[node.type] ?? typeColors.unknown}`}>
          {node.type}
        </span>

        {/* Size */}
        {node.size > 0 && <span className="text-[8px] text-ink-3">({node.size})</span>}

        {/* Value preview */}
        {node.value && (
          <span className="text-[9px] text-ink-3 truncate ml-1 max-w-48">{node.value}</span>
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
      <div className="flex items-center justify-center h-32 text-ink-3 text-[10px]">
        Select a document to view its state vector
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-3 text-[10px]">
        No state vector entries
      </div>
    )
  }

  return (
    <div className="p-2">
      <div className="text-[10px] text-ink-2 mb-2">
        {entries.length} client{entries.length !== 1 ? 's' : ''} in state vector
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 px-2 py-1 text-[9px] text-ink-3 font-semibold border-b border-hairline">
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
            className="flex items-center gap-4 px-2 py-1 border-b border-hairline text-[10px]"
          >
            <span className="w-24 font-mono text-ink-2">{entry.clientId}</span>
            <span className="w-16 text-right font-mono text-ink-2">{entry.clock}</span>
            <div className="flex-1 h-1.5 bg-background-emphasis rounded-full overflow-hidden">
              <div className="h-full bg-ink-2 rounded-full" style={{ width: `${pct}%` }} />
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
      className={`px-2 py-1.5 cursor-pointer text-[10px] ${isSelected ? 'bg-background-emphasis border-l-2 border-accent-ink' : 'hover:bg-accent border-l-2 border-transparent'}`}
    >
      <div className="font-mono text-ink-2 truncate">{doc.docId.slice(0, 16)}</div>
      <div className="flex items-center gap-2 text-ink-3 mt-0.5">
        <span>{doc.updateCount} updates</span>
        <span>{formatBytes(doc.totalBytes)}</span>
      </div>
      <div className="flex items-center gap-2 text-ink-3 mt-0.5">
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
        <span className="text-ink-3 w-16 font-mono">{formatTime(event.wallTime)}</span>
        <span className={`w-2 h-2 rounded-full ${event.isLocal ? 'bg-ink-2' : 'bg-ink-3'}`} />
        <span className="text-ink-2 w-12">{event.isLocal ? 'local' : 'remote'}</span>
        <span className="text-ink-3 font-mono truncate">{event.docId.slice(0, 12)}</span>
        <span className="text-ink-3 ml-auto">{formatBytes(event.updateSize)}</span>
        {event.origin && <span className="text-ink-3 truncate max-w-20">{event.origin}</span>}
      </div>
    )
  }

  // meta-change
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-[10px]">
      <span className="text-ink-3 w-16 font-mono">{formatTime(event.wallTime)}</span>
      <span className="w-2 h-2 rounded-full bg-warning" />
      <span className="text-ink-2 w-12">meta</span>
      <span className="text-ink-3 font-mono truncate">{event.docId.slice(0, 12)}</span>
      <span className="text-ink-3 ml-auto truncate">{event.keysChanged.join(', ')}</span>
    </div>
  )
}
