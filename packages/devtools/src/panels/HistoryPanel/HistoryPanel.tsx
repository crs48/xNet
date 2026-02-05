/**
 * HistoryPanel - DevTools panel for history, audit & time travel
 *
 * Sub-tabs: Timeline | Diff | Blame | Audit | Verification | Storage
 */

import type {
  TimelineEntry,
  BlameInfo,
  AuditEntry,
  PropertyDiff,
  VerificationResult,
  DocumentTimelineEntry
} from '@xnet/history'
import { useEffect, useState } from 'react'
import {
  formatTime,
  relativeTime,
  truncateDID,
  truncateCID,
  formatBytes,
  formatDuration
} from '../../utils/formatters'
import { useHistoryPanel, type HistorySubTab, type UseHistoryPanelResult } from './useHistoryPanel'

// ─── Sub-tab Config ──────────────────────────────────────────

const SUB_TABS: Array<{ id: HistorySubTab; label: string }> = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'diff', label: 'Diff' },
  { id: 'blame', label: 'Blame' },
  { id: 'audit', label: 'Audit' },
  { id: 'verification', label: 'Verify' },
  { id: 'storage', label: 'Storage' },
  { id: 'document', label: 'Document' }
]

// ─── Main Component ──────────────────────────────────────────

export function HistoryPanel() {
  const panel = useHistoryPanel()

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: node selector + sub-tabs */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        {/* Node selector */}
        <select
          value={panel.selectedNodeId ?? ''}
          onChange={(e) => panel.setSelectedNodeId(e.target.value || null)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 max-w-[200px]"
        >
          <option value="">Select node...</option>
          {panel.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.schemaIRI.split('/').pop()})
            </option>
          ))}
        </select>

        {/* Sub-tabs */}
        <div className="flex items-center gap-0.5 ml-2">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => panel.setActiveTab(tab.id)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                panel.activeTab === tab.id
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Change count */}
        {panel.selectedNodeId && (
          <span className="ml-auto text-[10px] text-zinc-500">{panel.timeline.length} changes</span>
        )}
      </div>

      {/* Error banner */}
      {panel.error && (
        <div className="px-3 py-1 bg-red-950/30 border-b border-red-800 text-[10px] text-red-400">
          {panel.error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!panel.selectedNodeId ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
            Select a node to view its history
          </div>
        ) : (
          <ActiveTabContent panel={panel} />
        )}
      </div>
    </div>
  )
}

// ─── Tab Router ──────────────────────────────────────────────

function ActiveTabContent({ panel }: { panel: UseHistoryPanelResult }) {
  switch (panel.activeTab) {
    case 'timeline':
      return <TimelineTab panel={panel} />
    case 'diff':
      return <DiffTab panel={panel} />
    case 'blame':
      return <BlameTab panel={panel} />
    case 'audit':
      return <AuditTab panel={panel} />
    case 'verification':
      return <VerificationTab panel={panel} />
    case 'storage':
      return <StorageTab panel={panel} />
    case 'document':
      return <DocumentTab panel={panel} />
  }
}

// ─── Timeline Tab ────────────────────────────────────────────

function TimelineTab({ panel }: { panel: UseHistoryPanelResult }) {
  return (
    <div className="flex h-full">
      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto">
        {panel.timelineLoading ? (
          <Loading />
        ) : panel.timeline.length === 0 ? (
          <Empty message="No changes recorded" />
        ) : (
          <>
            {/* Slider scrubber */}
            <div className="px-3 py-2 border-b border-zinc-800">
              <input
                type="range"
                min={0}
                max={panel.timeline.length - 1}
                value={panel.selectedTimelineIndex ?? panel.timeline.length - 1}
                onChange={(e) => {
                  const idx = Number(e.target.value)
                  panel.setSelectedTimelineIndex(idx)
                  panel.materializeAt({ type: 'index', index: idx })
                }}
                className="w-full h-1 accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>0</span>
                <span>
                  {panel.selectedTimelineIndex !== null
                    ? `Change ${panel.selectedTimelineIndex}`
                    : 'Latest'}
                </span>
                <span>{panel.timeline.length - 1}</span>
              </div>
            </div>

            {/* Change list */}
            {panel.timeline.map((entry, i) => (
              <TimelineRow
                key={i}
                entry={entry}
                isSelected={panel.selectedTimelineIndex === i}
                onClick={() => {
                  panel.setSelectedTimelineIndex(i)
                  panel.materializeAt({ type: 'index', index: i })
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Detail pane */}
      {panel.materializedState && (
        <div className="w-72 border-l border-zinc-800 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-zinc-200">
              State @ change {panel.materializedState.changeIndex}
            </h3>
            <button
              onClick={() => panel.clearMaterializedState()}
              className="text-zinc-500 hover:text-white text-xs"
            >
              x
            </button>
          </div>
          <div className="space-y-1 text-[10px]">
            <DetailRow label="Author" value={truncateDID(panel.materializedState.author)} />
            <DetailRow label="Time" value={relativeTime(panel.materializedState.timestamp)} />
            <DetailRow label="Hash" value={truncateCID(panel.materializedState.changeHash)} />
            <DetailRow
              label="Progress"
              value={`${panel.materializedState.changeIndex + 1} / ${panel.materializedState.totalChanges}`}
            />
          </div>
          <div className="mt-3">
            <h4 className="text-[10px] font-bold text-zinc-400 mb-1">Properties</h4>
            <pre className="text-[10px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(panel.materializedState.node.properties, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineRow({
  entry,
  isSelected,
  onClick
}: {
  entry: TimelineEntry
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1 cursor-pointer border-l-2 text-xs ${
        isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'
      }`}
    >
      <span className="text-[10px] text-zinc-600 w-16 font-mono">{formatTime(entry.wallTime)}</span>
      <span className="text-[10px] text-zinc-500 w-8 text-right">
        L:{entry.lamport?.time ?? '?'}
      </span>
      <span className={`w-2 h-2 rounded-full ${getOperationColor(entry.operation)}`} />
      <span className="text-[10px] text-zinc-300 w-14">{entry.operation}</span>
      <span className="text-[10px] text-zinc-500 truncate flex-1">
        {entry.properties.join(', ')}
      </span>
      <span className="text-[10px] text-zinc-600">{truncateDID(entry.author)}</span>
    </div>
  )
}

// ─── Diff Tab ────────────────────────────────────────────────

function DiffTab({ panel }: { panel: UseHistoryPanelResult }) {
  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <label className="text-[10px] text-zinc-500">From:</label>
        <input
          type="number"
          min={0}
          max={panel.timeline.length - 1}
          value={panel.diffFrom}
          onChange={(e) => panel.setDiffFrom(Number(e.target.value))}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 w-16"
        />
        <label className="text-[10px] text-zinc-500">To:</label>
        <input
          type="number"
          min={0}
          max={panel.timeline.length - 1}
          value={panel.diffTo}
          onChange={(e) => panel.setDiffTo(Number(e.target.value))}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 w-16"
        />
        <button
          onClick={panel.computeDiff}
          disabled={panel.diffLoading}
          className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {panel.diffLoading ? 'Computing...' : 'Diff'}
        </button>
        {panel.diffResult && (
          <span className="text-[10px] text-zinc-500 ml-auto">
            +{panel.diffResult.summary.added} ~{panel.diffResult.summary.modified} -
            {panel.diffResult.summary.removed}
          </span>
        )}
      </div>

      {/* Diff results */}
      <div className="flex-1 overflow-y-auto">
        {panel.diffResult ? (
          panel.diffResult.diffs.length === 0 ? (
            <Empty message="No differences" />
          ) : (
            panel.diffResult.diffs.map((d, i) => <DiffRow key={i} diff={d} />)
          )
        ) : (
          <Empty message="Select range and click Diff" />
        )}
      </div>
    </div>
  )
}

function DiffRow({ diff }: { diff: PropertyDiff }) {
  const colorMap = {
    added: {
      bg: 'bg-green-950/30',
      border: 'border-green-700',
      text: 'text-green-400',
      label: '+'
    },
    modified: {
      bg: 'bg-yellow-950/30',
      border: 'border-yellow-700',
      text: 'text-yellow-400',
      label: '~'
    },
    removed: { bg: 'bg-red-950/30', border: 'border-red-700', text: 'text-red-400', label: '-' }
  }
  const c = colorMap[diff.type]

  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${c.border} ${c.bg}`}>
      <span className={`text-xs font-bold ${c.text} w-3`}>{c.label}</span>
      <span className="text-xs text-zinc-200 w-28 shrink-0 font-mono">{diff.property}</span>
      <div className="flex-1 text-[10px] font-mono overflow-hidden">
        {diff.type === 'modified' && (
          <div className="text-red-400/70 line-through truncate">{JSON.stringify(diff.before)}</div>
        )}
        {diff.type === 'removed' && (
          <div className="text-red-400/70 line-through truncate">{JSON.stringify(diff.before)}</div>
        )}
        {(diff.type === 'added' || diff.type === 'modified') && (
          <div className={c.text + ' truncate'}>{JSON.stringify(diff.after)}</div>
        )}
      </div>
      <span className="text-[10px] text-zinc-600 shrink-0">{truncateDID(diff.changedBy)}</span>
    </div>
  )
}

// ─── Blame Tab ───────────────────────────────────────────────

function BlameTab({ panel }: { panel: UseHistoryPanelResult }) {
  useEffect(() => {
    if (panel.selectedNodeId && panel.blameInfo.length === 0) {
      panel.loadBlame()
    }
  }, [panel.selectedNodeId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] text-zinc-500">Per-property attribution</span>
        <button
          onClick={panel.loadBlame}
          disabled={panel.blameLoading}
          className="px-2 py-0.5 text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50 ml-auto"
        >
          {panel.blameLoading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {panel.blameLoading ? (
          <Loading />
        ) : panel.blameInfo.length === 0 ? (
          <Empty message="No blame data" />
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left px-3 py-1 font-medium">Property</th>
                <th className="text-left px-3 py-1 font-medium">Value</th>
                <th className="text-left px-3 py-1 font-medium">Last Changed By</th>
                <th className="text-left px-3 py-1 font-medium">When</th>
                <th className="text-right px-3 py-1 font-medium">Edits</th>
              </tr>
            </thead>
            <tbody>
              {panel.blameInfo.map((b) => (
                <BlameRow key={b.property} blame={b} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function BlameRow({ blame }: { blame: BlameInfo }) {
  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/50">
      <td className="px-3 py-1 font-mono text-zinc-200">{blame.property}</td>
      <td className="px-3 py-1 text-zinc-400 max-w-[120px] truncate font-mono">
        {JSON.stringify(blame.currentValue)}
      </td>
      <td className="px-3 py-1 text-zinc-400">{truncateDID(blame.lastChangedBy)}</td>
      <td className="px-3 py-1 text-zinc-500">{relativeTime(blame.lastChangedAt)}</td>
      <td className="px-3 py-1 text-zinc-500 text-right">{blame.totalEdits}</td>
    </tr>
  )
}

// ─── Audit Tab ───────────────────────────────────────────────

function AuditTab({ panel }: { panel: UseHistoryPanelResult }) {
  useEffect(() => {
    if (panel.selectedNodeId && panel.auditEntries.length === 0) {
      panel.loadAudit()
    }
  }, [panel.selectedNodeId])

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <select
          value={panel.auditOperationFilter ?? ''}
          onChange={(e) => {
            panel.setAuditOperationFilter(e.target.value || null)
          }}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[10px] text-zinc-200"
        >
          <option value="">All operations</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
          <option value="restore">restore</option>
        </select>
        <button
          onClick={panel.loadAudit}
          disabled={panel.auditLoading}
          className="px-2 py-0.5 text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50"
        >
          {panel.auditLoading ? 'Loading...' : 'Reload'}
        </button>

        {/* Activity summary */}
        {panel.activitySummary && (
          <span className="ml-auto text-[10px] text-zinc-500">
            {panel.activitySummary.totalChanges} total | {panel.activitySummary.authors.length}{' '}
            authors | C:{panel.activitySummary.creates} U:{panel.activitySummary.updates} D:
            {panel.activitySummary.deletes} R:{panel.activitySummary.restores}
          </span>
        )}
      </div>

      {/* Audit entries */}
      <div className="flex-1 overflow-y-auto">
        {panel.auditLoading ? (
          <Loading />
        ) : panel.auditEntries.length === 0 ? (
          <Empty message="No audit entries" />
        ) : (
          panel.auditEntries.map((entry, i) => <AuditRow key={i} entry={entry} />)
        )}
      </div>
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 border-b border-zinc-900 text-[10px]">
      <span className="text-zinc-600 w-16 font-mono">{formatTime(entry.wallTime)}</span>
      <span className={`w-2 h-2 rounded-full ${getOperationColor(entry.operation)}`} />
      <span className="text-zinc-300 w-14">{entry.operation}</span>
      <span className="text-zinc-500 truncate flex-1 font-mono">{entry.properties.join(', ')}</span>
      <span className="text-zinc-600">{truncateDID(entry.author)}</span>
    </div>
  )
}

// ─── Verification Tab ────────────────────────────────────────

function VerificationTab({ panel }: { panel: UseHistoryPanelResult }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <button
          onClick={panel.runVerification}
          disabled={panel.verificationLoading}
          className="px-3 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {panel.verificationLoading ? 'Verifying...' : 'Run Verification'}
        </button>

        {panel.verificationResult && (
          <span
            className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${
              panel.verificationResult.valid
                ? 'bg-green-900/40 text-green-400 border border-green-700'
                : 'bg-red-900/40 text-red-400 border border-red-700'
            }`}
          >
            {panel.verificationResult.valid ? 'VALID' : 'INVALID'}
          </span>
        )}

        {panel.verificationResult && (
          <span className="ml-auto text-[10px] text-zinc-500">
            {formatDuration(panel.verificationResult.duration)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {panel.verificationResult ? (
          <VerificationDetail result={panel.verificationResult} />
        ) : (
          <Empty message="Click 'Run Verification' to check chain integrity" />
        )}
      </div>
    </div>
  )
}

function VerificationDetail({ result }: { result: VerificationResult }) {
  const { stats, errors } = result
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total Changes" value={stats.totalChanges} />
        <StatCard label="Verified Hashes" value={stats.verifiedHashes} />
        <StatCard label="Valid Chain Links" value={stats.validChainLinks} />
        <StatCard label="Authors" value={stats.authors.length} />
        <StatCard label="Forks" value={stats.forks} />
        <StatCard label="Heads" value={stats.heads} />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-red-400 mb-1">Errors ({errors.length})</h4>
          <div className="space-y-1">
            {errors.map((err, i) => (
              <div
                key={i}
                className="px-2 py-1 bg-red-950/20 border border-red-900 rounded text-[10px]"
              >
                <span className="text-red-400 font-bold">{err.type}</span>
                <span className="text-zinc-400 ml-2">@ index {err.changeIndex}</span>
                <div className="text-zinc-500 mt-0.5">{err.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-900 rounded p-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200 font-bold">{value}</div>
    </div>
  )
}

// ─── Storage Tab ─────────────────────────────────────────────

function StorageTab({ panel }: { panel: UseHistoryPanelResult }) {
  useEffect(() => {
    if (panel.selectedNodeId && !panel.storageMetrics) {
      panel.loadStorageMetrics()
    }
  }, [panel.selectedNodeId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] text-zinc-500">Storage metrics & pruning candidates</span>
        <button
          onClick={panel.loadStorageMetrics}
          disabled={panel.storageLoading}
          className="px-2 py-0.5 text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50 ml-auto"
        >
          {panel.storageLoading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {panel.storageLoading ? (
          <Loading />
        ) : panel.storageMetrics ? (
          <div className="space-y-4">
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Total Changes" value={panel.storageMetrics.totalChanges} />
              <StatCard label="Prunable" value={panel.storageMetrics.prunableChanges} />
              <StatCard label="Est. Size" value={panel.storageMetrics.estimatedSize} />
            </div>

            <div className="space-y-1 text-[10px]">
              <DetailRow
                label="Oldest Change"
                value={
                  panel.storageMetrics.oldestChange
                    ? relativeTime(panel.storageMetrics.oldestChange)
                    : 'N/A'
                }
              />
              <DetailRow
                label="Newest Change"
                value={
                  panel.storageMetrics.newestChange
                    ? relativeTime(panel.storageMetrics.newestChange)
                    : 'N/A'
                }
              />
              <DetailRow
                label="Has Snapshot"
                value={panel.storageMetrics.hasSnapshot ? 'Yes' : 'No'}
              />
            </div>

            {/* Prune candidates */}
            {panel.pruneCandidates.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-zinc-400 mb-1">
                  Prune Candidates ({panel.pruneCandidates.length})
                </h4>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="text-left px-2 py-1 font-medium">Node</th>
                      <th className="text-right px-2 py-1 font-medium">Total</th>
                      <th className="text-right px-2 py-1 font-medium">Prunable</th>
                      <th className="text-right px-2 py-1 font-medium">Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {panel.pruneCandidates.map((c) => (
                      <tr key={c.nodeId} className="border-b border-zinc-900">
                        <td className="px-2 py-1 font-mono text-zinc-300">
                          {truncateCID(c.nodeId)}
                        </td>
                        <td className="px-2 py-1 text-zinc-400 text-right">{c.totalChanges}</td>
                        <td className="px-2 py-1 text-zinc-400 text-right">{c.prunableChanges}</td>
                        <td className="px-2 py-1 text-zinc-400 text-right">
                          {formatBytes(c.estimatedRecovery)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <Empty message="No storage data" />
        )}
      </div>
    </div>
  )
}

// ─── Document Tab ─────────────────────────────────────────────

function DocumentTab({ panel }: { panel: UseHistoryPanelResult }) {
  const [diffFrom, setDiffFrom] = useState<number>(0)
  const [diffTo, setDiffTo] = useState<number>(0)

  useEffect(() => {
    if (panel.selectedNodeId) {
      panel.loadDocumentTimeline()
    }
  }, [panel.selectedNodeId])

  useEffect(() => {
    if (panel.documentTimeline.length > 0) {
      setDiffTo(panel.documentTimeline.length - 1)
    }
  }, [panel.documentTimeline.length])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] text-zinc-500">Yjs document snapshots</span>
        <button
          onClick={panel.loadDocumentTimeline}
          disabled={panel.documentTimelineLoading}
          className="px-2 py-0.5 text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50 ml-auto"
        >
          {panel.documentTimelineLoading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {panel.documentTimelineLoading ? (
          <Loading />
        ) : panel.documentTimeline.length === 0 ? (
          <Empty message="No document snapshots recorded" />
        ) : (
          <div className="space-y-4">
            {/* Storage metrics */}
            {panel.docStorageMetrics && (
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Snapshots" value={panel.docStorageMetrics.snapshotCount} />
                <StatCard label="Total Bytes" value={panel.docStorageMetrics.totalBytes} />
                <StatCard
                  label="Avg Size"
                  value={
                    panel.docStorageMetrics.snapshotCount > 0
                      ? Math.round(
                          panel.docStorageMetrics.totalBytes / panel.docStorageMetrics.snapshotCount
                        )
                      : 0
                  }
                />
              </div>
            )}

            {/* Snapshot list */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-1">
                Snapshots ({panel.documentTimeline.length})
              </h4>
              {panel.documentTimeline.map((entry, i) => (
                <DocSnapshotRow
                  key={i}
                  entry={entry}
                  index={i}
                  isSelected={panel.selectedDocSnapshotIndex === i}
                  onClick={() => panel.loadDocSnapshot(i)}
                />
              ))}
            </div>

            {/* Selected snapshot content */}
            {panel.docSnapshotText !== null && (
              <div>
                <h4 className="text-[10px] font-bold text-zinc-400 mb-1">
                  Snapshot #{panel.selectedDocSnapshotIndex} Content
                </h4>
                <pre className="text-[10px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
                  {panel.docSnapshotText}
                </pre>
              </div>
            )}

            {/* Diff between snapshots */}
            {panel.documentTimeline.length >= 2 && (
              <div>
                <h4 className="text-[10px] font-bold text-zinc-400 mb-2">Diff Snapshots</h4>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[10px] text-zinc-500">From:</label>
                  <input
                    type="number"
                    min={0}
                    max={panel.documentTimeline.length - 1}
                    value={diffFrom}
                    onChange={(e) => setDiffFrom(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 w-16"
                  />
                  <label className="text-[10px] text-zinc-500">To:</label>
                  <input
                    type="number"
                    min={0}
                    max={panel.documentTimeline.length - 1}
                    value={diffTo}
                    onChange={(e) => setDiffTo(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 w-16"
                  />
                  <button
                    onClick={() => panel.computeDocDiff(diffFrom, diffTo)}
                    disabled={panel.docDiffLoading}
                    className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
                  >
                    {panel.docDiffLoading ? 'Diffing...' : 'Diff'}
                  </button>
                </div>

                {panel.docDiffResult && (
                  <div className="bg-zinc-900 rounded p-2 space-y-2">
                    <div className="text-[10px] text-zinc-500">
                      Snapshot #{panel.docDiffResult.fromIndex} vs #{panel.docDiffResult.toIndex}
                      {' | '}
                      Size delta: {panel.docDiffResult.sizeDelta > 0 ? '+' : ''}
                      {formatBytes(panel.docDiffResult.sizeDelta)}
                    </div>
                    {panel.docDiffResult.fromText !== panel.docDiffResult.toText ? (
                      <>
                        <div>
                          <div className="text-[10px] font-bold text-red-400 mb-0.5">Before</div>
                          <pre className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap bg-red-950/20 rounded p-1.5 max-h-32 overflow-y-auto">
                            {panel.docDiffResult.fromText || '[empty]'}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-green-400 mb-0.5">After</div>
                          <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap bg-green-950/20 rounded p-1.5 max-h-32 overflow-y-auto">
                            {panel.docDiffResult.toText || '[empty]'}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-zinc-500 font-mono">No text change</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DocSnapshotRow({
  entry,
  index,
  isSelected,
  onClick
}: {
  entry: DocumentTimelineEntry
  index: number
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1 cursor-pointer border-l-2 text-xs ${
        isSelected ? 'bg-zinc-800 border-purple-400' : 'border-transparent hover:bg-zinc-900'
      }`}
    >
      <span className="text-[10px] text-zinc-600 w-6 font-mono">#{index}</span>
      <span className="text-[10px] text-zinc-500 w-20 font-mono">{formatTime(entry.wallTime)}</span>
      <span className="w-2 h-2 rounded-full bg-purple-400" />
      <span className="text-[10px] text-zinc-300">snapshot</span>
      <span className="text-[10px] text-zinc-500 ml-auto">{formatBytes(entry.byteSize)}</span>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────

function Loading() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-xs">Loading...</div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-xs">{message}</div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 w-24">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  )
}

function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create':
      return 'bg-green-400'
    case 'update':
      return 'bg-blue-400'
    case 'delete':
      return 'bg-red-400'
    case 'restore':
      return 'bg-yellow-400'
    default:
      return 'bg-zinc-400'
  }
}
