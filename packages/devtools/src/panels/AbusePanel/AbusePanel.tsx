/**
 * AbusePanel - Policy decisions, labels, peer score, and moderation queues.
 */

import type {
  AbusePanelSummary,
  AbuseSubTab,
  LabelEntry,
  PolicyDecisionEntry,
  UsageSummaryEntry
} from './useAbusePanel'
import type { PeerScoreSnapshot } from '../../core/types'
import { useCallback, useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { relativeTime, truncateDID } from '../../utils/formatters'
import { useAbusePanel } from './useAbusePanel'

export function AbusePanel() {
  const state = useAbusePanel()

  const getAbuseData = useCallback(
    () => ({
      decisions: state.decisions,
      labels: state.labels,
      peerScores: state.peerScores,
      queues: state.queues,
      usageSummaries: state.usageSummaries,
      summary: state.summary
    }),
    [
      state.decisions,
      state.labels,
      state.peerScores,
      state.queues,
      state.usageSummaries,
      state.summary
    ]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <SummaryStrip summary={state.summary} />
        <div className="ml-auto">
          <CopyButton getData={getAbuseData} label="Copy Abuse" />
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <TabButton
          id="decisions"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Decisions"
          count={state.decisions.length}
        />
        <TabButton
          id="peers"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Peers"
          count={state.peerScores.length}
        />
        <TabButton
          id="labels"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Labels"
          count={state.labels.length}
        />
        <TabButton
          id="queues"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Queues"
          count={state.queues.length}
        />
        <TabButton
          id="usage"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Usage"
          count={state.usageSummaries.length}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {state.subTab === 'decisions' && <DecisionsPane decisions={state.decisions} />}
        {state.subTab === 'peers' && <PeerScorePane scores={state.peerScores} />}
        {state.subTab === 'labels' && <LabelsPane labels={state.labels} />}
        {state.subTab === 'queues' && <QueuesPane queues={state.queues} />}
        {state.subTab === 'usage' && <UsagePane summaries={state.usageSummaries} />}
      </div>
    </div>
  )
}

function SummaryStrip({ summary }: { summary: AbusePanelSummary }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <SummaryPill label="Decisions" value={summary.totalDecisions} />
      <SummaryPill
        label="Reject"
        value={summary.rejected}
        tone={summary.rejected > 0 ? 'red' : 'zinc'}
      />
      <SummaryPill
        label="Quarantine"
        value={summary.quarantined}
        tone={summary.quarantined > 0 ? 'yellow' : 'zinc'}
      />
      <SummaryPill
        label="Warn/Hide"
        value={summary.warnedOrHidden}
        tone={summary.warnedOrHidden > 0 ? 'yellow' : 'zinc'}
      />
      <SummaryPill
        label="Queues"
        value={summary.pendingQueueItems}
        tone={summary.pendingQueueItems > 0 ? 'blue' : 'zinc'}
      />
      <SummaryPill
        label="Risk Peers"
        value={summary.riskyPeers}
        tone={summary.riskyPeers > 0 ? 'red' : 'zinc'}
      />
      <SummaryPill
        label="Saved"
        value={summary.automationSavedUnits}
        tone={summary.automationSavedUnits > 0 ? 'green' : 'zinc'}
      />
      <SummaryPill
        label="Appeal"
        value={formatPercent(summary.appealLoadRatio)}
        tone={summary.appealLoadRatio > 0.2 ? 'yellow' : 'zinc'}
      />
    </div>
  )
}

function SummaryPill({
  label,
  value,
  tone = 'zinc'
}: {
  label: string
  value: number | string
  tone?: 'zinc' | 'blue' | 'green' | 'yellow' | 'red'
}) {
  const toneClass: Record<typeof tone, string> = {
    zinc: 'border-zinc-800 text-zinc-400',
    blue: 'border-blue-900/70 text-blue-300',
    green: 'border-green-900/70 text-green-300',
    yellow: 'border-yellow-900/70 text-yellow-300',
    red: 'border-red-900/70 text-red-300'
  }

  return (
    <div className={`px-2 py-1 border rounded text-[10px] whitespace-nowrap ${toneClass[tone]}`}>
      <span className="text-zinc-500">{label}</span>
      <span className="ml-1 font-mono text-zinc-200">{value}</span>
    </div>
  )
}

function TabButton({
  id,
  active,
  onClick,
  label,
  count
}: {
  id: AbuseSubTab
  active: AbuseSubTab
  onClick: (tab: AbuseSubTab) => void
  label: string
  count: number
}) {
  const isActive = id === active
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
        isActive
          ? 'bg-zinc-700 text-zinc-200'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
      }`}
    >
      {label} ({count})
    </button>
  )
}

function DecisionsPane({ decisions }: { decisions: PolicyDecisionEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id ?? null)
  const selected = decisions.find((decision) => decision.id === selectedId) ?? decisions[0] ?? null

  if (decisions.length === 0) {
    return <EmptyState text="No policy decisions recorded" />
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto border-r border-zinc-800">
        {decisions.map((decision) => (
          <DecisionRow
            key={decision.id}
            decision={decision}
            selected={decision.id === selected?.id}
            onClick={() => setSelectedId(decision.id)}
          />
        ))}
      </div>
      <div className="w-80 overflow-y-auto">
        {selected && <DecisionDetail decision={selected} />}
      </div>
    </div>
  )
}

function DecisionRow({
  decision,
  selected,
  onClick
}: {
  decision: PolicyDecisionEntry
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 border-b border-zinc-800/50 ${
        selected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge value={decision.admission} className={getAdmissionClass(decision.admission)} />
        <span className="text-[11px] text-zinc-200 truncate">{decision.surface}</span>
        <span className="text-[9px] text-zinc-600 ml-auto">{relativeTime(decision.timestamp)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-500 min-w-0">
        <span className="truncate">
          {decision.subjectId ?? decision.peerId ?? 'unknown-subject'}
        </span>
        {decision.reviewQueue && (
          <span className="text-blue-300">queue:{decision.reviewQueue}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {decision.reasons.slice(0, 3).map((reason) => (
          <Badge key={reason} value={reason} className="bg-zinc-900 text-zinc-400" />
        ))}
      </div>
    </button>
  )
}

function DecisionDetail({ decision }: { decision: PolicyDecisionEntry }) {
  return (
    <div className="p-3 space-y-3 text-[10px]">
      <div>
        <h4 className="text-[10px] font-semibold text-zinc-300 uppercase">Decision Detail</h4>
        <div className="text-zinc-600 mt-0.5">{new Date(decision.timestamp).toLocaleString()}</div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <DetailRow label="Admission" value={decision.admission} />
        <DetailRow label="Visibility" value={decision.visibility} />
        <DetailRow label="Reach" value={decision.reach} />
        <DetailRow label="Resource" value={decision.resource} />
        <DetailRow label="Counters" value={decision.includeInCounters ? 'include' : 'exclude'} />
        <DetailRow label="Search" value={decision.includeInSearch ? 'include' : 'exclude'} />
      </div>

      <div className="space-y-1">
        <DetailRow label="Surface" value={decision.surface} />
        {decision.scope && <DetailRow label="Scope" value={decision.scope} />}
        {decision.policyId && <DetailRow label="Policy" value={decision.policyId} />}
        {decision.actorDid && <DetailRow label="Actor" value={truncateDID(decision.actorDid)} />}
        {decision.peerId && <DetailRow label="Peer" value={decision.peerId.slice(0, 20)} />}
        {decision.peerScore !== undefined && (
          <DetailRow label="Peer Score" value={decision.peerScore.toFixed(0)} />
        )}
      </div>

      <TokenSection title="Reasons" tokens={decision.reasons} />
      <TokenSection title="Evidence" tokens={decision.evidenceRefs} empty="No evidence refs" />

      {decision.reviewQueue && (
        <div className="rounded border border-blue-900/50 bg-blue-950/20 p-2">
          <div className="text-blue-300 font-semibold">Review: {decision.reviewQueue}</div>
          <div className="text-zinc-500 mt-0.5">Priority {decision.reviewPriority ?? 0}</div>
        </div>
      )}

      {decision.labelsToEmit.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] uppercase text-zinc-500 font-semibold">Labels To Emit</div>
          {decision.labelsToEmit.map((label) => (
            <div
              key={`${label.value}:${label.reason}`}
              className="border border-zinc-800 rounded p-2"
            >
              <div className="flex justify-between">
                <span className="text-zinc-300">{label.value}</span>
                <span className="text-zinc-500">{Math.round(label.confidence * 100)}%</span>
              </div>
              <div className="text-zinc-600 mt-0.5">{label.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PeerScorePane({ scores }: { scores: PeerScoreSnapshot[] }) {
  const sorted = [...scores].sort((a, b) => a.score - b.score)

  if (sorted.length === 0) {
    return <EmptyState text="No peer score snapshots recorded" />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-[1fr_80px_120px_120px_120px] gap-2 px-3 py-1.5 border-b border-zinc-800 text-[9px] uppercase text-zinc-500 font-semibold sticky top-0 bg-zinc-950">
        <span>Peer</span>
        <span>Score</span>
        <span>Sync</span>
        <span>Abuse</span>
        <span>Last Seen</span>
      </div>
      {sorted.map((peer) => (
        <div
          key={peer.peerId}
          className="grid grid-cols-[1fr_80px_120px_120px_120px] gap-2 px-3 py-2 border-b border-zinc-800/50 text-[10px]"
        >
          <span className="font-mono text-zinc-300 truncate">{peer.peerId}</span>
          <span className={getPeerScoreClass(peer.score)}>{peer.score.toFixed(0)}</span>
          <span className="text-zinc-500">
            {peer.syncSuccesses}/{peer.syncFailures}
          </span>
          <span
            className={
              peer.invalidSignatures + peer.rateLimitViolations > 0
                ? 'text-red-300'
                : 'text-zinc-500'
            }
          >
            sig:{peer.invalidSignatures} rl:{peer.rateLimitViolations}
          </span>
          <span className="text-zinc-600">{relativeTime(peer.lastSeen)}</span>
        </div>
      ))}
    </div>
  )
}

function LabelsPane({ labels }: { labels: LabelEntry[] }) {
  if (labels.length === 0) {
    return <EmptyState text="No moderation labels recorded" />
  }

  return (
    <div className="h-full overflow-y-auto">
      {labels.map((label) => (
        <div key={label.id} className="px-3 py-2 border-b border-zinc-800/50 text-[10px]">
          <div className="flex items-center gap-2">
            <Badge value={label.action} className={getLabelActionClass(label.action)} />
            <span className="text-zinc-200 font-semibold">{label.value}</span>
            <span className="text-zinc-500">{Math.round(label.confidence * 100)}%</span>
            <span className="text-zinc-600 ml-auto">{relativeTime(label.timestamp)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[9px] text-zinc-500 min-w-0">
            <span className="truncate">{label.subjectId}</span>
            {label.surface && <span>{label.surface}</span>}
            {label.reason && <span>{label.reason}</span>}
          </div>
          {label.evidenceRefs.length > 0 && (
            <div className="mt-1 text-[9px] text-zinc-600 truncate">
              evidence: {label.evidenceRefs.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QueuesPane({ queues }: { queues: ReturnType<typeof useAbusePanel>['queues'] }) {
  if (queues.length === 0) {
    return <EmptyState text="No moderation queue snapshots recorded" />
  }

  return (
    <div className="p-3 h-full overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
      {queues.map((queue) => (
        <div key={queue.queue} className="border border-zinc-800 rounded p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-zinc-200">{queue.queue}</h4>
            <Badge
              value={`${queue.pending} pending`}
              className={
                queue.pending > 0 ? 'bg-blue-950 text-blue-300' : 'bg-zinc-900 text-zinc-500'
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
            <DetailRow label="Active" value={String(queue.active ?? 0)} />
            <DetailRow label="Priority" value={String(queue.highestPriority ?? 0)} />
            <DetailRow
              label="Oldest"
              value={queue.oldestQueuedAt ? relativeTime(queue.oldestQueuedAt) : 'none'}
            />
            <DetailRow label="Samples" value={String(queue.sampleSubjectIds?.length ?? 0)} />
          </div>
          {queue.sampleSubjectIds && queue.sampleSubjectIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {queue.sampleSubjectIds.slice(0, 6).map((subjectId) => (
                <Badge
                  key={subjectId}
                  value={subjectId.slice(0, 16)}
                  className="bg-zinc-900 text-zinc-500"
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function UsagePane({ summaries }: { summaries: UsageSummaryEntry[] }) {
  const latest = summaries[0] ?? null

  if (!latest) {
    return <EmptyState text="No abuse usage summaries recorded" />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-[11px] font-semibold text-zinc-200">Latest Usage Summary</h4>
            <div className="text-[9px] text-zinc-600 mt-0.5">
              {latest.period ?? 'current period'} / {relativeTime(latest.timestamp)}
            </div>
          </div>
          <Badge value={`${summaries.length} snapshots`} className="bg-zinc-900 text-zinc-400" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <MetricTile label="Total Units" value={formatNumber(latest.summary.totalUnits)} />
          <MetricTile
            label="Automation Saved"
            value={formatNumber(latest.summary.automationSavedUnits)}
            tone={latest.summary.automationSavedUnits > 0 ? 'green' : 'zinc'}
          />
          <MetricTile
            label="Saved Cost"
            value={formatMicroUsd(latest.summary.automationSavedCostMicroUsd)}
            tone={latest.summary.automationSavedCostMicroUsd > 0 ? 'green' : 'zinc'}
          />
          <MetricTile
            label="Appeal Load"
            value={formatPercent(latest.summary.appealLoadRatio)}
            tone={latest.summary.appealLoadRatio > 0.2 ? 'yellow' : 'zinc'}
          />
          <MetricTile label="Review Load" value={formatPercent(latest.summary.reviewLoadRatio)} />
          <MetricTile
            label="Blocked"
            value={formatNumber(latest.summary.blockedUnits)}
            tone={latest.summary.blockedUnits > 0 ? 'red' : 'zinc'}
          />
          <MetricTile
            label="Throttled"
            value={formatNumber(latest.summary.throttledUnits)}
            tone={latest.summary.throttledUnits > 0 ? 'yellow' : 'zinc'}
          />
          <MetricTile
            label="Appeal Cost"
            value={formatMicroUsd(latest.summary.appealCostMicroUsd)}
          />
        </div>
      </div>

      <div className="grid grid-cols-[120px_1fr_90px_90px_90px_90px] gap-2 px-3 py-1.5 border-b border-zinc-800 text-[9px] uppercase text-zinc-500 font-semibold sticky top-0 bg-zinc-950">
        <span>When</span>
        <span>Scope</span>
        <span>Saved</span>
        <span>Appeal</span>
        <span>Review</span>
        <span>Cost</span>
      </div>
      {summaries.map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-[120px_1fr_90px_90px_90px_90px] gap-2 px-3 py-2 border-b border-zinc-800/50 text-[10px]"
        >
          <span className="text-zinc-600">{relativeTime(entry.timestamp)}</span>
          <span className="text-zinc-300 truncate">
            {[entry.hubId, entry.workspaceId, entry.period].filter(Boolean).join(' / ') || 'local'}
          </span>
          <span className="text-green-300">{formatNumber(entry.summary.automationSavedUnits)}</span>
          <span className="text-zinc-400">{formatPercent(entry.summary.appealLoadRatio)}</span>
          <span className="text-zinc-400">{formatPercent(entry.summary.reviewLoadRatio)}</span>
          <span className="text-zinc-500">
            {formatMicroUsd(entry.summary.automationSavedCostMicroUsd)}
          </span>
        </div>
      ))}
    </div>
  )
}

function MetricTile({
  label,
  value,
  tone = 'zinc'
}: {
  label: string
  value: string
  tone?: 'zinc' | 'green' | 'yellow' | 'red'
}) {
  const valueClass: Record<typeof tone, string> = {
    zinc: 'text-zinc-200',
    green: 'text-green-300',
    yellow: 'text-yellow-300',
    red: 'text-red-300'
  }

  return (
    <div className="border border-zinc-800 rounded p-2 min-w-0">
      <div className="text-[9px] text-zinc-500 uppercase">{label}</div>
      <div className={`text-[13px] font-mono mt-1 truncate ${valueClass[tone]}`}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 truncate">{value}</span>
    </div>
  )
}

function TokenSection({
  title,
  tokens,
  empty = 'None'
}: {
  title: string
  tokens: string[]
  empty?: string
}) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase text-zinc-500 font-semibold">{title}</div>
      <div className="flex flex-wrap gap-1">
        {tokens.length > 0 ? (
          tokens.map((token) => (
            <Badge key={token} value={token} className="bg-zinc-900 text-zinc-400" />
          ))
        ) : (
          <span className="text-zinc-600">{empty}</span>
        )}
      </div>
    </div>
  )
}

function Badge({ value, className }: { value: string; className: string }) {
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded whitespace-nowrap ${className}`}>
      {value}
    </span>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full text-zinc-600 text-[10px]">{text}</div>
  )
}

function getAdmissionClass(admission: string): string {
  if (admission === 'reject') return 'bg-red-950 text-red-300'
  if (admission === 'quarantine') return 'bg-yellow-950 text-yellow-300'
  return 'bg-green-950 text-green-300'
}

function getLabelActionClass(action: LabelEntry['action']): string {
  switch (action) {
    case 'applied':
      return 'bg-green-950 text-green-300'
    case 'proposed':
      return 'bg-blue-950 text-blue-300'
    case 'removed':
      return 'bg-zinc-900 text-zinc-400'
    case 'expired':
      return 'bg-yellow-950 text-yellow-300'
  }
}

function getPeerScoreClass(score: number): string {
  if (score <= 10) return 'text-red-300'
  if (score <= 30) return 'text-orange-300'
  if (score <= 50) return 'text-yellow-300'
  return 'text-green-300'
}

function formatNumber(value: number): string {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatMicroUsd(value: number): string {
  return `$${(value / 1_000_000).toFixed(value >= 100_000 ? 2 : 4)}`
}
