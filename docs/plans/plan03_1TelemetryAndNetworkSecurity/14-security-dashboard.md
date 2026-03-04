# 14: Security Dashboard

> UI components for security status and management

**Duration:** 2 days  
**Dependencies:** All previous security documents

## Overview

A React-based dashboard for viewing network security status, managing blocked peers, and reviewing telemetry.

## Components

### Security Status Overview

```tsx
// packages/ui/src/security/SecurityDashboard.tsx

import { useNetworkSecurity } from '@xnetjs/react'

export function SecurityDashboard() {
  const security = useNetworkSecurity()

  return (
    <div className="security-dashboard">
      <header className="security-header">
        <h2>Network Security</h2>
        <HealthIndicator health={security.overallHealth} />
      </header>

      <div className="security-grid">
        <StatsCard
          title="Active Connections"
          value={security.stats.connections}
          max={security.limits.maxConnections}
        />
        <StatsCard
          title="Blocked Peers"
          value={security.stats.blockedPeers}
          trend={security.stats.recentBlocks > 0 ? 'up' : 'stable'}
        />
        <StatsCard title="Rate Limit Hits" value={security.stats.rateLimitHits} period="1h" />
        <StatsCard title="Avg Peer Score" value={security.stats.avgPeerScore} format="score" />
      </div>

      <div className="security-panels">
        <RecentEventsPanel events={security.recentEvents} />
        <PeerScoresPanel scores={security.peerScores} />
        <BlockedPeersPanel blocked={security.blockedPeers} />
      </div>
    </div>
  )
}
```

### Health Indicator

```tsx
// packages/ui/src/security/HealthIndicator.tsx

interface HealthIndicatorProps {
  health: number // 0-100
}

export function HealthIndicator({ health }: HealthIndicatorProps) {
  const status = health >= 80 ? 'good' : health >= 50 ? 'warning' : 'critical'

  return (
    <div className={`health-indicator health-${status}`}>
      <div className="health-bar" style={{ width: `${health}%` }} />
      <span className="health-label">{health}%</span>
    </div>
  )
}
```

### Recent Events Panel

```tsx
// packages/ui/src/security/RecentEventsPanel.tsx

interface RecentEventsPanelProps {
  events: SecurityEvent[]
}

export function RecentEventsPanel({ events }: RecentEventsPanelProps) {
  return (
    <div className="panel recent-events">
      <h3>Recent Security Events</h3>

      <div className="events-list">
        {events.map(event => (
          <EventRow key={event.id} event={event} />
        ))}

        {events.length === 0 && (
          <div className="empty-state">No recent events</div>
        )}
      </div>

      <footer>
        <button onClick={() => /* open full log */}>
          View All Events
        </button>
        <button onClick={() => /* export */}>
          Export Log
        </button>
      </footer>
    </div>
  )
}

function EventRow({ event }: { event: SecurityEvent }) {
  const severityColors = {
    low: 'blue',
    medium: 'yellow',
    high: 'orange',
    critical: 'red',
  }

  return (
    <div className={`event-row severity-${event.severity}`}>
      <span className="event-time">
        {formatTime(event.occurredAt)}
      </span>
      <span className="event-type">{event.eventType}</span>
      <span className="event-peer">{event.peerIdHash?.slice(0, 8)}...</span>
      <span className={`event-action action-${event.actionTaken}`}>
        {event.actionTaken}
      </span>
    </div>
  )
}
```

### Peer Scores Panel

```tsx
// packages/ui/src/security/PeerScoresPanel.tsx

interface PeerScoresPanelProps {
  scores: PeerScore[]
}

export function PeerScoresPanel({ scores }: PeerScoresPanelProps) {
  const [sortBy, setSortBy] = useState<'score' | 'lastSeen'>('score')

  const sorted = [...scores].sort((a, b) =>
    sortBy === 'score' ? b.score - a.score : b.lastSeen - a.lastSeen
  )

  return (
    <div className="panel peer-scores">
      <h3>Peer Reputation</h3>

      <div className="score-distribution">
        <ScoreBar
          label="Excellent"
          count={scores.filter((s) => s.score >= 50).length}
          color="green"
        />
        <ScoreBar
          label="Good"
          count={scores.filter((s) => s.score >= 20 && s.score < 50).length}
          color="blue"
        />
        <ScoreBar
          label="Neutral"
          count={scores.filter((s) => s.score >= 0 && s.score < 20).length}
          color="gray"
        />
        <ScoreBar label="Low" count={scores.filter((s) => s.score < 0).length} color="orange" />
      </div>

      <table className="peers-table">
        <thead>
          <tr>
            <th onClick={() => setSortBy('score')}>Score</th>
            <th>Peer</th>
            <th>Syncs</th>
            <th>Issues</th>
            <th onClick={() => setSortBy('lastSeen')}>Last Seen</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 10).map((peer) => (
            <PeerRow key={peer.peerId} peer={peer} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### Blocked Peers Panel

```tsx
// packages/ui/src/security/BlockedPeersPanel.tsx

interface BlockedPeersPanelProps {
  blocked: Array<{ peerId: string; info: BlockInfo }>
  onUnblock: (peerId: string) => void
}

export function BlockedPeersPanel({ blocked, onUnblock }: BlockedPeersPanelProps) {
  return (
    <div className="panel blocked-peers">
      <h3>Blocked Peers ({blocked.length})</h3>

      {blocked.length === 0 ? (
        <div className="empty-state">No blocked peers</div>
      ) : (
        <div className="blocked-list">
          {blocked.map(({ peerId, info }) => (
            <div key={peerId} className="blocked-item">
              <div className="blocked-info">
                <span className="peer-id">{peerId.slice(0, 16)}...</span>
                <span className="reason">{info.reason}</span>
                <span className="blocked-at">
                  Blocked {formatRelative(info.blockedAt)}
                </span>
                {info.expiresAt && (
                  <span className="expires">
                    Expires {formatRelative(info.expiresAt)}
                  </span>
                )}
                {info.auto && <span className="auto-badge">Auto</span>}
              </div>

              <button
                className="unblock-btn"
                onClick={() => onUnblock(peerId)}
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      <footer>
        <button onClick={() => /* open settings */}>
          Configure Auto-Blocking
        </button>
      </footer>
    </div>
  )
}
```

### useNetworkSecurity Hook

```tsx
// packages/react/src/hooks/useNetworkSecurity.ts

import { useState, useEffect } from 'react'

interface NetworkSecurityState {
  overallHealth: number
  stats: {
    connections: number
    blockedPeers: number
    recentBlocks: number
    rateLimitHits: number
    avgPeerScore: number
  }
  limits: ConnectionLimits
  recentEvents: SecurityEvent[]
  peerScores: PeerScore[]
  blockedPeers: Array<{ peerId: string; info: BlockInfo }>
}

export function useNetworkSecurity(): NetworkSecurityState & {
  blockPeer: (peerId: string, reason: string) => void
  unblockPeer: (peerId: string) => void
  refreshStats: () => Promise<void>
} {
  const [state, setState] = useState<NetworkSecurityState>(/* initial */)

  // Subscribe to security events
  useEffect(() => {
    const unsubscribe = securityManager.subscribe((update) => {
      setState((prev) => ({ ...prev, ...update }))
    })
    return unsubscribe
  }, [])

  const blockPeer = (peerId: string, reason: string) => {
    autoBlocker.blockPeer(peerId, { reason, autoBlock: false })
  }

  const unblockPeer = (peerId: string) => {
    autoBlocker.unblockPeer(peerId)
  }

  const refreshStats = async () => {
    // Refresh all stats
  }

  return {
    ...state,
    blockPeer,
    unblockPeer,
    refreshStats
  }
}
```

## Styles (CSS)

```css
/* packages/ui/src/security/security.css */

.security-dashboard {
  padding: 24px;
}

.security-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.health-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
}

.health-bar {
  width: 100px;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.health-bar::after {
  content: '';
  display: block;
  height: 100%;
  transition: width 0.3s;
}

.health-good .health-bar::after {
  background: var(--green);
}
.health-warning .health-bar::after {
  background: var(--yellow);
}
.health-critical .health-bar::after {
  background: var(--red);
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.panel {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
}

.event-row {
  display: grid;
  grid-template-columns: 80px 1fr 100px 80px;
  gap: 12px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.severity-critical {
  border-left: 3px solid var(--red);
}
.severity-high {
  border-left: 3px solid var(--orange);
}
.severity-medium {
  border-left: 3px solid var(--yellow);
}
.severity-low {
  border-left: 3px solid var(--blue);
}

.action-blocked {
  color: var(--red);
}
.action-throttled {
  color: var(--orange);
}
.action-logged {
  color: var(--gray);
}
```

## Checklist

- [ ] Create SecurityDashboard main component
- [ ] Create HealthIndicator component
- [ ] Create RecentEventsPanel component
- [ ] Create PeerScoresPanel component
- [ ] Create BlockedPeersPanel component
- [ ] Create useNetworkSecurity hook
- [ ] Add styles
- [ ] Test components
- [ ] Integrate with xNet settings

---

[Back to README](./README.md) | [Previous: Telemetry Sync](./13-telemetry-sync.md) | [Next: Future Work](./15-future-work.md)
