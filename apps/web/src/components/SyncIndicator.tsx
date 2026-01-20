/**
 * Sync status indicator
 */
interface Props {
  status: 'offline' | 'connecting' | 'synced'
  peerCount: number
}

export function SyncIndicator({ status, peerCount }: Props) {
  const statusColors = {
    offline: '#ff4444',
    connecting: '#ffaa00',
    synced: '#44bb44'
  }

  const statusLabels = {
    offline: 'Offline',
    connecting: 'Connecting...',
    synced: `${peerCount} peer${peerCount !== 1 ? 's' : ''}`
  }

  return (
    <div className="sync-indicator" title={`${status} - ${peerCount} peers`}>
      <span
        className="status-dot"
        style={{ backgroundColor: statusColors[status] }}
      />
      <span className="status-text">{statusLabels[status]}</span>
    </div>
  )
}
