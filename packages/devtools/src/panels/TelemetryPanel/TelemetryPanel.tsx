/**
 * TelemetryPanel - Security events, performance metrics, and consent status
 *
 * Integrates with @xnet/telemetry (planStep03_1) to display:
 * - Security events with severity and action badges
 * - Performance metrics with bucket distributions
 * - Consent tier status and management
 */

import { useState, useCallback } from 'react'
import {
  useTelemetryPanel,
  type SubTab,
  type SecurityEntry,
  type PerformanceGroup,
  type NetworkHealth,
  type ConsentState,
  type CrashEntry,
  type PeerScoreSnapshot
} from './useTelemetryPanel'
import { CopyButton } from '../../components/CopyButton'

// ─── Main Panel ────────────────────────────────────────────

export function TelemetryPanel() {
  const state = useTelemetryPanel()

  const getTelemetryData = useCallback(
    () => ({
      securityEvents: state.securityEvents,
      performanceEvents: state.performanceEvents,
      crashEvents: state.crashEvents,
      consent: state.consent,
      peerScores: state.peerScores
    }),
    [
      state.securityEvents,
      state.performanceEvents,
      state.crashEvents,
      state.consent,
      state.peerScores
    ]
  )

  // Check if any telemetry events have been received
  const hasData =
    state.securityEvents.length > 0 ||
    state.performanceEvents.length > 0 ||
    state.crashEvents.length > 0 ||
    state.consent.lastChanged !== null

  if (!hasData && state.consent.tier === 'off') {
    return <TelemetryNotAvailable />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800">
        <TabButton id="security" active={state.subTab} onClick={state.setSubTab} label="Security" />
        <TabButton
          id="performance"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Performance"
        />
        <TabButton id="consent" active={state.subTab} onClick={state.setSubTab} label="Consent" />
        <div className="ml-auto">
          <CopyButton getData={getTelemetryData} label="Copy Telemetry" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {state.subTab === 'security' && (
          <SecuritySubPanel
            events={state.securityEvents}
            crashes={state.crashEvents}
            health={state.networkHealth}
            peerScores={state.peerScores}
          />
        )}
        {state.subTab === 'performance' && <PerformanceSubPanel groups={state.performanceGroups} />}
        {state.subTab === 'consent' && <ConsentSubPanel consent={state.consent} />}
      </div>
    </div>
  )
}

// ─── Sub-Tab Button ────────────────────────────────────────

function TabButton({
  id,
  active,
  onClick,
  label
}: {
  id: SubTab
  active: SubTab
  onClick: (tab: SubTab) => void
  label: string
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
      {label}
    </button>
  )
}

// ─── Security Sub-Panel ────────────────────────────────────

function SecuritySubPanel({
  events,
  crashes,
  health,
  peerScores
}: {
  events: SecurityEntry[]
  crashes: CrashEntry[]
  health: NetworkHealth
  peerScores: PeerScoreSnapshot[]
}) {
  const [selectedEvent, setSelectedEvent] = useState<SecurityEntry | null>(null)

  return (
    <div className="flex h-full">
      {/* Left: Event list */}
      <div className="flex-1 overflow-y-auto border-r border-zinc-800">
        {/* Health bar */}
        <div className="sticky top-0 bg-zinc-950 px-3 py-1.5 border-b border-zinc-800 z-10">
          <NetworkHealthBar health={health} />
        </div>

        {/* Security events */}
        {events.length === 0 && crashes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-[10px]">
            No security events recorded
          </div>
        ) : (
          <>
            {crashes.length > 0 && (
              <div className="px-3 py-1 border-b border-zinc-800/50">
                <span className="text-[9px] text-red-400 font-semibold uppercase">
                  Crashes ({crashes.length})
                </span>
              </div>
            )}
            {crashes.map((crash) => (
              <CrashEventEntry key={crash.id} crash={crash} />
            ))}
            {events.map((event) => (
              <SecurityEventEntry
                key={event.id}
                event={event}
                isSelected={selectedEvent?.id === event.id}
                onClick={() => setSelectedEvent(event)}
              />
            ))}
          </>
        )}
      </div>

      {/* Right: Peer scores + detail */}
      <div className="w-64 overflow-y-auto">
        {selectedEvent ? (
          <div className="p-2">
            <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        ) : (
          <PeerScoreList scores={peerScores} />
        )}
      </div>
    </div>
  )
}

// ─── Network Health Bar ────────────────────────────────────

function NetworkHealthBar({ health }: { health: NetworkHealth }) {
  const color =
    health.score > 80 ? 'bg-green-400' : health.score > 50 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-400">Health:</span>
      <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${health.score}%` }} />
      </div>
      <span className="text-[10px] text-zinc-300">{health.score}%</span>
      <span className="text-[9px] text-zinc-500 ml-2">
        ({health.recentEventCount} events last hour)
      </span>
    </div>
  )
}

// ─── Security Event Entry ──────────────────────────────────

function SecurityEventEntry({
  event,
  isSelected,
  onClick
}: {
  event: SecurityEntry
  isSelected: boolean
  onClick: () => void
}) {
  const severityColor: Record<string, string> = {
    low: 'text-zinc-400',
    medium: 'text-yellow-400',
    high: 'text-orange-400',
    critical: 'text-red-400'
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 px-3 py-1.5 border-b border-zinc-800/50 cursor-pointer transition-colors ${
        isSelected ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
      }`}
    >
      {/* Severity indicator */}
      <span
        className={`text-[10px] font-bold w-4 ${severityColor[event.severity] ?? 'text-zinc-400'}`}
      >
        {event.severity[0]?.toUpperCase() ?? '?'}
      </span>

      {/* Event info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-200 truncate">{event.eventType}</span>
          <ActionBadge action={event.actionTaken} />
        </div>
        <div className="text-[9px] text-zinc-500 mt-0.5">{formatRelativeTime(event.timestamp)}</div>
      </div>
    </div>
  )
}

// ─── Crash Event Entry ─────────────────────────────────────

function CrashEventEntry({ crash }: { crash: CrashEntry }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-b border-zinc-800/50 bg-red-950/20">
      <span className="text-[10px] font-bold text-red-400 w-4">!</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-red-300 truncate">{crash.errorType}</span>
          {crash.component && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-red-900/50 text-red-300">
              {crash.component}
            </span>
          )}
        </div>
        <div className="text-[9px] text-zinc-500 mt-0.5 truncate">{crash.errorMessage}</div>
        <div className="text-[9px] text-zinc-600 mt-0.5">{formatRelativeTime(crash.timestamp)}</div>
      </div>
    </div>
  )
}

// ─── Action Badge ──────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    none: 'bg-zinc-800 text-zinc-400',
    logged: 'bg-zinc-800 text-zinc-300',
    warned: 'bg-yellow-900 text-yellow-300',
    throttled: 'bg-orange-900 text-orange-300',
    blocked: 'bg-red-900 text-red-300',
    reported: 'bg-purple-900 text-purple-300'
  }

  return (
    <span className={`text-[8px] px-1 py-0.5 rounded ${colors[action] ?? colors.none}`}>
      {action}
    </span>
  )
}

// ─── Event Detail ──────────────────────────────────────────

function EventDetail({ event, onClose }: { event: SecurityEntry; onClose: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-zinc-300 uppercase">Event Detail</h4>
        <button onClick={onClose} className="text-[10px] text-zinc-500 hover:text-zinc-300">
          x
        </button>
      </div>
      <div className="space-y-1.5 text-[10px]">
        <DetailRow label="Type" value={event.eventType} />
        <DetailRow label="Severity" value={event.severity} />
        <DetailRow label="Action" value={event.actionTaken} />
        <DetailRow label="Time" value={new Date(event.timestamp).toLocaleTimeString()} />
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  )
}

// ─── Peer Score List ───────────────────────────────────────

function PeerScoreList({ scores }: { scores: PeerScoreSnapshot[] }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score)

  return (
    <div className="p-2">
      <h4 className="text-[10px] font-semibold text-zinc-400 uppercase mb-2">
        Peer Scores ({scores.length})
      </h4>

      {sorted.length === 0 ? (
        <div className="text-[9px] text-zinc-600">No peers connected</div>
      ) : (
        sorted.map((peer) => (
          <div key={peer.peerId} className="py-1.5 border-b border-zinc-800/50">
            <div className="flex items-center gap-2">
              {/* Score bar */}
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getScoreBarColor(peer.score)}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, ((peer.score + 100) / 200) * 100))}%`
                  }}
                />
              </div>

              {/* Score value */}
              <span
                className={`text-[10px] w-8 text-right font-mono ${getScoreTextColor(peer.score)}`}
              >
                {peer.score > 0 ? '+' : ''}
                {peer.score.toFixed(0)}
              </span>

              {/* Peer ID */}
              <span className="text-[10px] text-zinc-400 font-mono truncate flex-1">
                {peer.peerId.slice(0, 12)}
              </span>
            </div>

            {/* Breakdown */}
            <div className="flex gap-2 mt-0.5 ml-14 text-[8px] text-zinc-600">
              <span title="Sync successes">S:{peer.syncSuccesses}</span>
              <span title="Sync failures">F:{peer.syncFailures}</span>
              {peer.invalidSignatures > 0 && (
                <span className="text-red-500" title="Invalid signatures">
                  Sig:{peer.invalidSignatures}
                </span>
              )}
              {peer.rateLimitViolations > 0 && (
                <span className="text-orange-500" title="Rate limit violations">
                  RL:{peer.rateLimitViolations}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function getScoreBarColor(score: number): string {
  if (score > 50) return 'bg-green-400'
  if (score > 0) return 'bg-blue-400'
  if (score > -20) return 'bg-yellow-400'
  if (score > -50) return 'bg-orange-400'
  return 'bg-red-400'
}

function getScoreTextColor(score: number): string {
  if (score > 50) return 'text-green-400'
  if (score > 0) return 'text-blue-400'
  if (score > -20) return 'text-yellow-400'
  if (score > -50) return 'text-orange-400'
  return 'text-red-400'
}

// ─── Security Summary ──────────────────────────────────────

function SecuritySummary({ events, health }: { events: SecurityEntry[]; health: NetworkHealth }) {
  const severityCounts = events.reduce(
    (acc, e) => {
      acc[e.severity] = (acc[e.severity] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const actionCounts = events.reduce(
    (acc, e) => {
      acc[e.actionTaken] = (acc[e.actionTaken] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-semibold text-zinc-400 uppercase">Summary</h4>

      <div className="space-y-1">
        <span className="text-[9px] text-zinc-500">By Severity</span>
        {Object.entries(severityCounts).map(([severity, count]) => (
          <div key={severity} className="flex justify-between text-[10px]">
            <span className="text-zinc-400 capitalize">{severity}</span>
            <span className="text-zinc-300">{count}</span>
          </div>
        ))}
        {Object.keys(severityCounts).length === 0 && (
          <div className="text-[9px] text-zinc-600">No events</div>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-[9px] text-zinc-500">By Action</span>
        {Object.entries(actionCounts).map(([action, count]) => (
          <div key={action} className="flex justify-between text-[10px]">
            <span className="text-zinc-400 capitalize">{action}</span>
            <span className="text-zinc-300">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Performance Sub-Panel ─────────────────────────────────

function PerformanceSubPanel({ groups }: { groups: PerformanceGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-[10px]">
        No performance metrics recorded
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      {groups.map((group) => (
        <div key={group.metric}>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-semibold text-zinc-300">{group.metric}</h4>
            <span className="text-[9px] text-zinc-500">{group.total} samples</span>
          </div>
          <BucketDistribution buckets={group.buckets} total={group.total} />
        </div>
      ))}
    </div>
  )
}

function BucketDistribution({ buckets, total }: { buckets: Map<string, number>; total: number }) {
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])
  const maxCount = Math.max(...sorted.map(([, c]) => c), 1)

  return (
    <div className="space-y-1">
      {sorted.map(([bucket, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0
        const barWidth = (count / maxCount) * 100

        return (
          <div key={bucket} className="flex items-center gap-2">
            <span className="text-[9px] text-zinc-400 w-16 truncate font-mono">{bucket}</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="text-[9px] text-zinc-500 w-8 text-right">{pct.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Consent Sub-Panel ─────────────────────────────────────

function ConsentSubPanel({ consent }: { consent: ConsentState }) {
  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <h3 className="text-sm font-bold text-zinc-200">Telemetry Consent</h3>

      {/* Current tier */}
      <div className="space-y-2">
        <label className="text-[11px] text-zinc-400">Current Tier</label>
        <div className="flex items-center gap-2">
          <TierBadge tier={consent.tier} />
          {consent.previousTier && consent.previousTier !== consent.tier && (
            <span className="text-[9px] text-zinc-600">(was: {consent.previousTier})</span>
          )}
        </div>
        {consent.lastChanged && (
          <div className="text-[9px] text-zinc-600">
            Changed: {new Date(consent.lastChanged).toLocaleString()}
          </div>
        )}
      </div>

      {/* Tier descriptions */}
      <div className="space-y-1.5">
        <TierRow tier="off" label="Off" desc="Nothing collected" current={consent.tier} />
        <TierRow
          tier="local"
          label="Local"
          desc="Stored locally for debugging"
          current={consent.tier}
        />
        <TierRow
          tier="crashes"
          label="Crashes"
          desc="+ crash reports shared"
          current={consent.tier}
        />
        <TierRow
          tier="anonymous"
          label="Anonymous"
          desc="+ bucketed usage metrics"
          current={consent.tier}
        />
      </div>

      {/* Info note (read-only in devtools) */}
      <div className="border-t border-zinc-800 pt-3">
        <p className="text-[10px] text-zinc-500">
          Consent is managed by the application. This panel provides a read-only view of the current
          telemetry configuration.
        </p>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    off: 'bg-zinc-800 text-zinc-400',
    local: 'bg-blue-900 text-blue-300',
    crashes: 'bg-yellow-900 text-yellow-300',
    anonymous: 'bg-green-900 text-green-300'
  }

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${colors[tier] ?? colors.off}`}>
      {tier}
    </span>
  )
}

function TierRow({
  tier,
  label,
  desc,
  current
}: {
  tier: string
  label: string
  desc: string
  current: string
}) {
  const isActive = tier === current
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] ${
        isActive ? 'bg-zinc-800/80 border border-zinc-700' : 'border border-transparent'
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-blue-400' : 'bg-zinc-700'}`} />
      <span className={isActive ? 'text-zinc-200 font-semibold' : 'text-zinc-400'}>{label}</span>
      <span className="text-zinc-600 flex-1">{desc}</span>
    </div>
  )
}

// ─── Fallback ──────────────────────────────────────────────

function TelemetryNotAvailable() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      <div className="text-center">
        <p>No telemetry data available.</p>
        <p className="text-[10px] mt-1 text-zinc-600">
          Telemetry events will appear here once @xnet/telemetry is instrumented.
        </p>
      </div>
    </div>
  )
}

// ─── Utilities ─────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  if (delta < 1000) return 'just now'
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}
