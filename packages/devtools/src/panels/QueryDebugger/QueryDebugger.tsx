/**
 * QueryDebugger panel - tracks active useQuery/useMutate/useDocument hooks
 *
 * Displays active subscriptions, update frequency, and performance metrics.
 */

import { useQueryDebugger, type QueryStats } from './useQueryDebugger'
import { relativeTime } from '../../utils/formatters'

export function QueryDebugger() {
  const { queries, selectedQuery, setSelectedQuery, sortBy, setSortBy, totalUpdates, avgRender } =
    useQueryDebugger()

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-400">
          Active: <strong className="text-zinc-200">{queries.length}</strong>
        </span>
        <span className="text-[10px] text-zinc-400">
          Updates: <strong className="text-zinc-200">{totalUpdates}</strong>
        </span>
        <span className="text-[10px] text-zinc-400">
          Avg render: <strong className="text-zinc-200">{avgRender.toFixed(1)}ms</strong>
        </span>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="ml-auto bg-zinc-800 text-[10px] text-zinc-300 rounded px-2 py-0.5 border border-zinc-700"
        >
          <option value="updates">Sort: Most Updates</option>
          <option value="render">Sort: Slowest Render</option>
          <option value="recent">Sort: Most Recent</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Query list */}
        <div className="flex-1 overflow-y-auto border-r border-zinc-800">
          {queries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-[10px]">
              No active queries. Hooks will appear here when they mount.
            </div>
          ) : (
            queries.map((query) => (
              <QueryEntry
                key={query.id}
                query={query}
                isSelected={selectedQuery?.id === query.id}
                onSelect={() => setSelectedQuery(query)}
              />
            ))
          )}
        </div>

        {/* Detail pane */}
        {selectedQuery && (
          <div className="w-64 overflow-y-auto p-2 text-[10px]">
            <h4 className="text-zinc-400 font-semibold mb-2 uppercase text-[9px]">Detail</h4>

            <div className="space-y-1.5">
              <DetailRow label="Hook" value={selectedQuery.type} />
              <DetailRow label="Schema" value={selectedQuery.schemaId} />
              <DetailRow label="Mode" value={selectedQuery.mode} />
              <DetailRow label="Updates" value={String(selectedQuery.updateCount)} />
              <DetailRow label="Results" value={String(selectedQuery.resultCount)} />
              <DetailRow label="Avg Render" value={`${selectedQuery.avgRenderTime.toFixed(2)}ms`} />
              <DetailRow
                label="Peak Render"
                value={`${selectedQuery.peakRenderTime.toFixed(2)}ms`}
              />
              <DetailRow
                label="Total Time"
                value={`${selectedQuery.totalRenderTime.toFixed(1)}ms`}
              />
              {selectedQuery.filter && (
                <div>
                  <div className="text-zinc-500">Filter:</div>
                  <pre className="text-zinc-400 mt-0.5 bg-zinc-900 p-1 rounded text-[9px] overflow-x-auto">
                    {JSON.stringify(selectedQuery.filter, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Performance warnings */}
            <div className="mt-3 space-y-1">
              {selectedQuery.peakRenderTime > 50 && (
                <Warning
                  level="error"
                  text={`Peak render ${selectedQuery.peakRenderTime.toFixed(0)}ms (>50ms)`}
                />
              )}
              {selectedQuery.peakRenderTime > 16 && selectedQuery.peakRenderTime <= 50 && (
                <Warning
                  level="warn"
                  text={`Peak render ${selectedQuery.peakRenderTime.toFixed(0)}ms (dropped frame)`}
                />
              )}
              {selectedQuery.resultCount > 1000 && (
                <Warning
                  level="warn"
                  text={`Large result set (${selectedQuery.resultCount} items)`}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QueryEntry({
  query,
  isSelected,
  onSelect
}: {
  query: QueryStats
  isSelected: boolean
  onSelect: () => void
}) {
  const typeBadge = {
    useQuery: 'bg-blue-900 text-blue-300',
    useDocument: 'bg-purple-900 text-purple-300',
    useMutate: 'bg-green-900 text-green-300'
  }[query.type]

  return (
    <div
      onClick={onSelect}
      className={`px-3 py-2 border-b border-zinc-800/50 cursor-pointer ${
        isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${typeBadge}`}>
          {query.type}
        </span>
        <span className="text-[11px] text-zinc-200 truncate">
          {query.schemaId.split('/').pop()}
        </span>
        <span className="text-[9px] text-zinc-500">({query.mode})</span>
      </div>

      <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-500">
        <span>Updates: {query.updateCount}</span>
        <span>Results: {query.resultCount}</span>
        <span>Avg: {query.avgRenderTime.toFixed(1)}ms</span>
        {query.peakRenderTime > 16 && (
          <span className="text-amber-400">Peak: {query.peakRenderTime.toFixed(0)}ms</span>
        )}
        {query.lastUpdateAt && <span className="ml-auto">{relativeTime(query.lastUpdateAt)}</span>}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  )
}

function Warning({ level, text }: { level: 'warn' | 'error'; text: string }) {
  const cls = level === 'error' ? 'text-red-400 bg-red-950' : 'text-amber-400 bg-amber-950'
  return <div className={`text-[9px] px-1.5 py-0.5 rounded ${cls}`}>{text}</div>
}
