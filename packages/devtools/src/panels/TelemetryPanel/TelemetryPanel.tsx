/**
 * TelemetryPanel - Security events, performance metrics, and consent status
 *
 * Integrates with @xnetjs/telemetry (plan03_1) to display:
 * - Security events with severity and action badges
 * - Performance metrics with bucket distributions
 * - Consent tier status and management
 */

import { useState, useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
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
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-hairline">
        <TabButton id="security" active={state.subTab} onClick={state.setSubTab} label="Security" />
        <TabButton
          id="performance"
          active={state.subTab}
          onClick={state.setSubTab}
          label="Performance"
        />
        <TabButton id="usage" active={state.subTab} onClick={state.setSubTab} label="Usage" />
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
        {state.subTab === 'usage' && <UsageSubPanel groups={state.usageGroups} />}
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
          ? 'bg-background-emphasis text-ink-1'
          : 'text-ink-3 hover:text-ink-1 hover:bg-accent'
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
      <div className="flex-1 overflow-y-auto border-r border-hairline">
        {/* Health bar */}
        <div className="sticky top-0 bg-surface-1 px-3 py-1.5 border-b border-hairline z-10">
          <NetworkHealthBar health={health} />
        </div>

        {/* Security events */}
        {events.length === 0 && crashes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-ink-3 text-[10px]">
            No security events recorded
          </div>
        ) : (
          <>
            {crashes.length > 0 && (
              <div className="px-3 py-1 border-b border-hairline">
                <span className="text-[9px] text-destructive font-semibold uppercase">
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
    health.score > 80 ? 'bg-success' : health.score > 50 ? 'bg-warning' : 'bg-destructive'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ink-2">Health:</span>
      <div className="w-24 h-2 bg-background-emphasis rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${health.score}%` }} />
      </div>
      <span className="text-[10px] text-ink-2">{health.score}%</span>
      <span className="text-[9px] text-ink-3 ml-2">
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
    low: 'text-ink-2',
    medium: 'text-warning',
    high: 'text-warning',
    critical: 'text-destructive'
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 px-3 py-1.5 border-b border-hairline cursor-pointer transition-colors ${
        isSelected ? 'bg-background-emphasis' : 'hover:bg-accent'
      }`}
    >
      {/* Severity indicator */}
      <span
        className={`text-[10px] font-bold w-4 ${severityColor[event.severity] ?? 'text-ink-2'}`}
      >
        {event.severity[0]?.toUpperCase() ?? '?'}
      </span>

      {/* Event info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-1 truncate">{event.eventType}</span>
          <ActionBadge action={event.actionTaken} />
        </div>
        <div className="text-[9px] text-ink-3 mt-0.5">{formatRelativeTime(event.timestamp)}</div>
      </div>
    </div>
  )
}

// ─── Crash Event Entry ─────────────────────────────────────

function CrashEventEntry({ crash }: { crash: CrashEntry }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-b border-hairline bg-destructive-muted">
      <span className="text-[10px] font-bold text-destructive w-4">!</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-destructive truncate">{crash.errorType}</span>
          {crash.component && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-destructive-muted text-destructive">
              {crash.component}
            </span>
          )}
        </div>
        <div className="text-[9px] text-ink-3 mt-0.5 truncate">{crash.errorMessage}</div>
        <div className="text-[9px] text-ink-3 mt-0.5">{formatRelativeTime(crash.timestamp)}</div>
      </div>
    </div>
  )
}

// ─── Action Badge ──────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    none: 'bg-background-emphasis text-ink-2',
    logged: 'bg-background-emphasis text-ink-2',
    warned: 'bg-warning-muted text-warning',
    throttled: 'bg-warning-muted text-warning',
    blocked: 'bg-destructive-muted text-destructive',
    reported: 'bg-background-emphasis text-ink-1'
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
        <h4 className="text-[10px] font-semibold text-ink-2 uppercase">Event Detail</h4>
        <button onClick={onClose} className="text-[10px] text-ink-3 hover:text-ink-1">
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
      <span className="text-ink-3">{label}</span>
      <span className="text-ink-2">{value}</span>
    </div>
  )
}

// ─── Peer Score List ───────────────────────────────────────

function PeerScoreList({ scores }: { scores: PeerScoreSnapshot[] }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score)

  return (
    <div className="p-2">
      <h4 className="text-[10px] font-semibold text-ink-2 uppercase mb-2">
        Peer Scores ({scores.length})
      </h4>

      {sorted.length === 0 ? (
        <div className="text-[9px] text-ink-3">No peers connected</div>
      ) : (
        sorted.map((peer) => (
          <div key={peer.peerId} className="py-1.5 border-b border-hairline">
            <div className="flex items-center gap-2">
              {/* Score bar */}
              <div className="w-12 h-1.5 bg-background-emphasis rounded-full overflow-hidden">
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
              <span className="text-[10px] text-ink-2 font-mono truncate flex-1">
                {peer.peerId.slice(0, 12)}
              </span>
            </div>

            {/* Breakdown */}
            <div className="flex gap-2 mt-0.5 ml-14 text-[8px] text-ink-3">
              <span title="Sync successes">S:{peer.syncSuccesses}</span>
              <span title="Sync failures">F:{peer.syncFailures}</span>
              {peer.invalidSignatures > 0 && (
                <span className="text-destructive" title="Invalid signatures">
                  Sig:{peer.invalidSignatures}
                </span>
              )}
              {peer.rateLimitViolations > 0 && (
                <span className="text-warning" title="Rate limit violations">
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
  if (score > 50) return 'bg-success'
  if (score > 0) return 'bg-ink-2'
  if (score > -20) return 'bg-warning'
  if (score > -50) return 'bg-warning'
  return 'bg-destructive'
}

function getScoreTextColor(score: number): string {
  if (score > 50) return 'text-success'
  if (score > 0) return 'text-ink-2'
  if (score > -20) return 'text-warning'
  if (score > -50) return 'text-warning'
  return 'text-destructive'
}

// ─── Security Summary ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SecuritySummary({
  events,
  _health
}: {
  events: SecurityEntry[]
  _health?: NetworkHealth
}) {
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
      <h4 className="text-[10px] font-semibold text-ink-2 uppercase">Summary</h4>

      <div className="space-y-1">
        <span className="text-[9px] text-ink-3">By Severity</span>
        {Object.entries(severityCounts).map(([severity, count]) => (
          <div key={severity} className="flex justify-between text-[10px]">
            <span className="text-ink-2 capitalize">{severity}</span>
            <span className="text-ink-2">{count}</span>
          </div>
        ))}
        {Object.keys(severityCounts).length === 0 && (
          <div className="text-[9px] text-ink-3">No events</div>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-[9px] text-ink-3">By Action</span>
        {Object.entries(actionCounts).map(([action, count]) => (
          <div key={action} className="flex justify-between text-[10px]">
            <span className="text-ink-2 capitalize">{action}</span>
            <span className="text-ink-2">{count}</span>
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
      <div className="flex items-center justify-center h-full text-ink-3 text-[10px]">
        No performance metrics recorded
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      {groups.map((group) => (
        <div key={group.metric}>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-semibold text-ink-2">{group.metric}</h4>
            <span className="text-[9px] text-ink-3">{group.total} samples</span>
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
            <span className="text-[9px] text-ink-2 w-16 truncate font-mono">{bucket}</span>
            <div className="flex-1 h-1.5 bg-background-emphasis rounded-full overflow-hidden">
              <div className="h-full bg-ink-2 rounded-full" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="text-[9px] text-ink-3 w-8 text-right">{pct.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Usage Sub-Panel ───────────────────────────────────────

function UsageSubPanel({ groups }: { groups: PerformanceGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-ink-3 text-[10px]">
        No usage metrics recorded
      </div>
    )
  }

  const totalEvents = groups.reduce((sum, g) => sum + g.total, 0)

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-ink-2 uppercase">Usage metrics</h4>
        <span className="text-[9px] text-ink-3">{totalEvents} events</span>
      </div>
      {groups.map((group) => (
        <div key={group.metric}>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-semibold text-ink-2">{group.metric}</h4>
            <span className="text-[9px] text-ink-3">{group.total} samples</span>
          </div>
          <BucketDistribution buckets={group.buckets} total={group.total} />
        </div>
      ))}
    </div>
  )
}

// ─── Consent Sub-Panel ─────────────────────────────────────

function ConsentSubPanel({ consent }: { consent: ConsentState }) {
  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <h3 className="text-sm font-bold text-ink-1">Telemetry Consent</h3>

      {/* Current tier */}
      <div className="space-y-2">
        <label className="text-[11px] text-ink-2">Current Tier</label>
        <div className="flex items-center gap-2">
          <TierBadge tier={consent.tier} />
          {consent.previousTier && consent.previousTier !== consent.tier && (
            <span className="text-[9px] text-ink-3">(was: {consent.previousTier})</span>
          )}
        </div>
        {consent.lastChanged && (
          <div className="text-[9px] text-ink-3">
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
      <div className="border-t border-hairline pt-3">
        <p className="text-[10px] text-ink-3">
          Consent is managed by the application. This panel provides a read-only view of the current
          telemetry configuration.
        </p>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    off: 'bg-background-emphasis text-ink-2',
    local: 'bg-background-emphasis text-ink-1',
    crashes: 'bg-warning-muted text-warning',
    anonymous: 'bg-success-muted text-success'
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
        isActive ? 'bg-background-emphasis border border-hairline' : 'border border-transparent'
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent-ink' : 'bg-background-emphasis'}`}
      />
      <span className={isActive ? 'text-ink-1 font-semibold' : 'text-ink-2'}>{label}</span>
      <span className="text-ink-3 flex-1">{desc}</span>
    </div>
  )
}

// ─── Fallback ──────────────────────────────────────────────

function TelemetryNotAvailable() {
  return (
    <div className="flex items-center justify-center h-full text-ink-3 text-sm">
      <div className="text-center">
        <p>No telemetry data available.</p>
        <p className="text-[10px] mt-1 text-ink-3">
          Telemetry events will appear here once @xnetjs/telemetry is instrumented.
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
