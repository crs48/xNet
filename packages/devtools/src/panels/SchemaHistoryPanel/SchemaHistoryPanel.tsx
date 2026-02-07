/**
 * SchemaHistoryPanel - DevTools panel for viewing database schema version history
 *
 * Displays the timeline of schema changes with version info, change types,
 * and column diffs between versions.
 */

import { useEffect, useState, useMemo } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import { formatTime, relativeTime } from '../../utils/formatters'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchemaVersionEntry {
  version: string
  timestamp: number
  columns: StoredColumn[]
  changeType: 'initial' | 'add' | 'update' | 'delete'
  changeDescription?: string
}

interface StoredColumn {
  id: string
  name: string
  type: string
  config?: Record<string, unknown>
}

interface ColumnDiff {
  type: 'added' | 'removed' | 'modified'
  columnId: string
  columnName: string
  details?: string
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SchemaHistoryPanel() {
  const { activeNodeId } = useDevTools()
  const [history, setHistory] = useState<SchemaVersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Load schema history from the active node's Y.Doc
  useEffect(() => {
    if (!activeNodeId) {
      setHistory([])
      return
    }

    setLoading(true)
    setError(null)

    // Access the Y.Doc through the window's sync manager (if available)
    const loadHistory = async () => {
      try {
        // Try to get the doc from the global sync manager
        const syncManager = (window as unknown as { __xnet_sync_manager__?: unknown })
          .__xnet_sync_manager__ as
          | { getDoc: (id: string) => Promise<{ getMap: (key: string) => Map<string, unknown> }> }
          | undefined

        if (!syncManager) {
          setError('Sync manager not available')
          setLoading(false)
          return
        }

        const doc = await syncManager.getDoc(activeNodeId)
        if (!doc) {
          setError('Document not found')
          setLoading(false)
          return
        }

        const dataMap = doc.getMap('data')
        const schemaHistory = dataMap.get('schemaHistory') as SchemaVersionEntry[] | undefined

        if (schemaHistory && Array.isArray(schemaHistory)) {
          setHistory(schemaHistory)
          if (schemaHistory.length > 0) {
            setSelectedIndex(schemaHistory.length - 1)
          }
        } else {
          setHistory([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [activeNodeId])

  // Compute diff between two versions
  const selectedDiff = useMemo(() => {
    if (selectedIndex === null || selectedIndex === 0) return null
    if (history.length < 2) return null

    const current = history[selectedIndex]
    const previous = history[selectedIndex - 1]

    return computeColumnDiff(previous.columns, current.columns)
  }, [history, selectedIndex])

  if (!activeNodeId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
        Select a database node to view schema history
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-xs">{error}</div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
        No schema history recorded for this database
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] text-zinc-500">Schema Version History</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{history.length} versions</span>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timeline list */}
        <div className="w-1/2 overflow-y-auto border-r border-zinc-800">
          {history.map((entry, i) => (
            <HistoryRow
              key={i}
              entry={entry}
              isSelected={selectedIndex === i}
              onClick={() => setSelectedIndex(i)}
            />
          ))}
        </div>

        {/* Detail pane */}
        <div className="w-1/2 overflow-y-auto p-3">
          {selectedIndex !== null && history[selectedIndex] && (
            <VersionDetail
              entry={history[selectedIndex]}
              diff={selectedDiff}
              isFirst={selectedIndex === 0}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── History Row ─────────────────────────────────────────────────────────────

function HistoryRow({
  entry,
  isSelected,
  onClick
}: {
  entry: SchemaVersionEntry
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 text-xs ${
        isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'
      }`}
    >
      <span className="text-[10px] text-zinc-600 w-16 font-mono">
        {formatTime(entry.timestamp)}
      </span>
      <span className={`w-2 h-2 rounded-full ${getChangeTypeColor(entry.changeType)}`} />
      <span className="text-[10px] text-zinc-300 font-mono">v{entry.version}</span>
      <span className="text-[10px] text-zinc-500 truncate flex-1">
        {entry.changeDescription || entry.changeType}
      </span>
    </div>
  )
}

// ─── Version Detail ──────────────────────────────────────────────────────────

function VersionDetail({
  entry,
  diff,
  isFirst
}: {
  entry: SchemaVersionEntry
  diff: ColumnDiff[] | null
  isFirst: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Version info */}
      <div className="space-y-1 text-[10px]">
        <DetailRow label="Version" value={entry.version} />
        <DetailRow label="Time" value={relativeTime(entry.timestamp)} />
        <DetailRow label="Change Type" value={entry.changeType} />
        {entry.changeDescription && (
          <DetailRow label="Description" value={entry.changeDescription} />
        )}
        <DetailRow label="Columns" value={String(entry.columns.length)} />
      </div>

      {/* Column diff */}
      {!isFirst && diff && diff.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-400 mb-1">
            Changes from previous version
          </h4>
          <div className="space-y-1">
            {diff.map((d, i) => (
              <DiffRow key={i} diff={d} />
            ))}
          </div>
        </div>
      )}

      {/* Column list */}
      <div>
        <h4 className="text-[10px] font-bold text-zinc-400 mb-1">Columns at this version</h4>
        <div className="space-y-0.5">
          {entry.columns.map((col) => (
            <div key={col.id} className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-300">{col.name}</span>
              <span className="text-zinc-500 font-mono">{col.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Diff Row ────────────────────────────────────────────────────────────────

function DiffRow({ diff }: { diff: ColumnDiff }) {
  const colors = {
    added: {
      bg: 'bg-green-950/30',
      border: 'border-green-700',
      text: 'text-green-400',
      label: '+'
    },
    removed: { bg: 'bg-red-950/30', border: 'border-red-700', text: 'text-red-400', label: '-' },
    modified: {
      bg: 'bg-yellow-950/30',
      border: 'border-yellow-700',
      text: 'text-yellow-400',
      label: '~'
    }
  }
  const c = colors[diff.type]

  return (
    <div
      className={`flex items-center gap-2 px-2 py-0.5 border-l-2 ${c.border} ${c.bg} text-[10px]`}
    >
      <span className={`font-bold ${c.text} w-3`}>{c.label}</span>
      <span className="text-zinc-200">{diff.columnName}</span>
      {diff.details && <span className="text-zinc-500">{diff.details}</span>}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 w-20">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  )
}

function getChangeTypeColor(changeType: string): string {
  switch (changeType) {
    case 'initial':
      return 'bg-blue-400'
    case 'add':
      return 'bg-green-400'
    case 'update':
      return 'bg-yellow-400'
    case 'delete':
      return 'bg-red-400'
    default:
      return 'bg-zinc-400'
  }
}

function computeColumnDiff(before: StoredColumn[], after: StoredColumn[]): ColumnDiff[] {
  const diffs: ColumnDiff[] = []

  const beforeMap = new Map(before.map((c) => [c.id, c]))
  const afterMap = new Map(after.map((c) => [c.id, c]))

  // Check for added columns
  for (const col of after) {
    if (!beforeMap.has(col.id)) {
      diffs.push({
        type: 'added',
        columnId: col.id,
        columnName: col.name
      })
    }
  }

  // Check for removed columns
  for (const col of before) {
    if (!afterMap.has(col.id)) {
      diffs.push({
        type: 'removed',
        columnId: col.id,
        columnName: col.name
      })
    }
  }

  // Check for modified columns
  for (const col of after) {
    const prevCol = beforeMap.get(col.id)
    if (prevCol) {
      const changes: string[] = []
      if (prevCol.name !== col.name) {
        changes.push(`renamed from "${prevCol.name}"`)
      }
      if (prevCol.type !== col.type) {
        changes.push(`type: ${prevCol.type} -> ${col.type}`)
      }
      if (changes.length > 0) {
        diffs.push({
          type: 'modified',
          columnId: col.id,
          columnName: col.name,
          details: changes.join(', ')
        })
      }
    }
  }

  return diffs
}
