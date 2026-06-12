/**
 * QueryDebugger panel - tracks active useQuery/useMutate/useNode hooks
 *
 * Displays active subscriptions, update frequency, and performance metrics.
 */

import { useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { relativeTime } from '../../utils/formatters'
import { useQueryDebugger, type QueryStats } from './useQueryDebugger'

export function QueryDebugger() {
  const { queries, selectedQuery, setSelectedQuery, sortBy, setSortBy, totalUpdates, avgRender } =
    useQueryDebugger()

  const getQueriesData = useCallback(() => queries, [queries])

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-hairline">
        <span className="text-[10px] text-ink-2">
          Active: <strong className="text-ink-1">{queries.length}</strong>
        </span>
        <span className="text-[10px] text-ink-2">
          Updates: <strong className="text-ink-1">{totalUpdates}</strong>
        </span>
        <span className="text-[10px] text-ink-2">
          Avg render: <strong className="text-ink-1">{avgRender.toFixed(1)}ms</strong>
        </span>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="ml-auto bg-background-emphasis text-[10px] text-ink-2 rounded px-2 py-0.5 border border-hairline"
        >
          <option value="updates">Sort: Most Updates</option>
          <option value="render">Sort: Slowest Render</option>
          <option value="recent">Sort: Most Recent</option>
        </select>
        <CopyButton getData={getQueriesData} label="Copy Queries" />
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Query list */}
        <div className="flex-1 overflow-y-auto border-r border-hairline">
          {queries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-3 text-[10px]">
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
            <h4 className="text-ink-2 font-semibold mb-2 uppercase text-[9px]">Detail</h4>

            <div className="space-y-1.5">
              <DetailRow label="Hook" value={selectedQuery.type} />
              <DetailRow label="Schema" value={selectedQuery.schemaId} />
              <DetailRow label="Mode" value={selectedQuery.mode} />
              {selectedQuery.descriptorKey && (
                <div>
                  <div className="text-ink-3">Descriptor:</div>
                  <pre className="text-ink-2 mt-0.5 bg-surface-2 p-1 rounded text-[9px] overflow-x-auto">
                    {selectedQuery.descriptorKey}
                  </pre>
                </div>
              )}
              {selectedQuery.callerInfo && (
                <DetailRow label="Source" value={selectedQuery.callerInfo} />
              )}
              {selectedQuery.source && <DetailRow label="Read From" value={selectedQuery.source} />}
              {selectedQuery.plan?.strategy && (
                <DetailRow label="Plan" value={selectedQuery.plan.strategy} />
              )}
              {selectedQuery.materialized && (
                <DetailRow
                  label="View"
                  value={`${selectedQuery.materialized.viewId} (${
                    selectedQuery.materialized.cacheHit ? 'hit' : 'miss'
                  })`}
                />
              )}
              {selectedQuery.stream && (
                <DetailRow
                  label="Stream"
                  value={`${selectedQuery.stream.lastEvent} / ${selectedQuery.stream.status}`}
                />
              )}
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
                  <div className="text-ink-3">Filter:</div>
                  <pre className="text-ink-2 mt-0.5 bg-surface-2 p-1 rounded text-[9px] overflow-x-auto">
                    {JSON.stringify(selectedQuery.filter, null, 2)}
                  </pre>
                </div>
              )}
              {selectedQuery.plan && (
                <div>
                  <div className="text-ink-3">Plan:</div>
                  <pre className="text-ink-2 mt-0.5 bg-surface-2 p-1 rounded text-[9px] overflow-x-auto">
                    {JSON.stringify(selectedQuery.plan, null, 2)}
                  </pre>
                </div>
              )}
              {selectedQuery.materialized && (
                <div>
                  <div className="text-ink-3">Materialized:</div>
                  <pre className="text-ink-2 mt-0.5 bg-surface-2 p-1 rounded text-[9px] overflow-x-auto">
                    {JSON.stringify(selectedQuery.materialized, null, 2)}
                  </pre>
                </div>
              )}
              {selectedQuery.streamTimeline.length > 0 && (
                <div>
                  <div className="text-ink-3">Stream Timeline:</div>
                  <div className="mt-0.5 space-y-1">
                    {selectedQuery.streamTimeline.slice(-8).map((event, index) => (
                      <div
                        key={`${event.lastEventAt}-${index}`}
                        className="bg-surface-2 rounded px-1 py-0.5"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="text-ink-2 font-mono">{event.lastEvent}</span>
                          <span className="text-ink-3">{relativeTime(event.lastEventAt)}</span>
                        </div>
                        <div className="text-ink-3">
                          {event.status}
                          {event.progress?.phase ? ` / ${event.progress.phase}` : ''}
                          {event.resetReason ? ` / ${event.resetReason}` : ''}
                        </div>
                        {event.error && <div className="text-destructive">{event.error}</div>}
                      </div>
                    ))}
                  </div>
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
    useQuery: 'bg-background-emphasis text-ink-1',
    useNode: 'bg-background-emphasis text-ink-1',
    useMutate: 'bg-background-emphasis text-ink-1'
  }[query.type]

  return (
    <div
      onClick={onSelect}
      className={`px-3 py-2 border-b border-hairline cursor-pointer ${
        isSelected ? 'bg-background-emphasis' : 'hover:bg-accent'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${typeBadge}`}>
          {query.type}
        </span>
        <span className="text-[11px] text-ink-1 truncate">{query.schemaId.split('/').pop()}</span>
        <span className="text-[9px] text-ink-3">({query.mode})</span>
      </div>

      {query.callerInfo && (
        <div className="text-[8px] text-ink-3 mt-0.5 font-mono truncate">{query.callerInfo}</div>
      )}
      <div className="flex items-center gap-3 mt-1 text-[9px] text-ink-3">
        <span>Updates: {query.updateCount}</span>
        <span>Results: {query.resultCount}</span>
        <span>Avg: {query.avgRenderTime.toFixed(1)}ms</span>
        {query.source && <span>Source: {query.source}</span>}
        {query.stream && (
          <span>
            Stream: {query.stream.lastEvent}/{query.stream.status}
          </span>
        )}
        {query.peakRenderTime > 16 && (
          <span className="text-warning">Peak: {query.peakRenderTime.toFixed(0)}ms</span>
        )}
        {query.lastUpdateAt && <span className="ml-auto">{relativeTime(query.lastUpdateAt)}</span>}
      </div>
      {query.descriptorKey && (
        <div className="text-[8px] text-ink-3 mt-1 font-mono truncate">{query.descriptorKey}</div>
      )}
      {(query.plan?.strategy || query.materialized) && (
        <div className="flex items-center gap-2 mt-1 text-[8px] text-ink-3">
          {query.plan?.strategy && <span>Plan: {query.plan.strategy}</span>}
          {query.materialized && (
            <span>
              View: {query.materialized.viewId} ({query.materialized.cacheHit ? 'hit' : 'miss'})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink-2 font-mono">{value}</span>
    </div>
  )
}

function Warning({ level, text }: { level: 'warn' | 'error'; text: string }) {
  const cls =
    level === 'error' ? 'text-destructive bg-destructive-muted' : 'text-warning bg-warning-muted'
  return <div className={`text-[9px] px-1.5 py-0.5 rounded ${cls}`}>{text}</div>
}
