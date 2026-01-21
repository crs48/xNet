/**
 * Sync status indicator
 */
interface Props {
  status: 'offline' | 'connecting' | 'synced'
  peerCount: number
}

export function SyncIndicator({ status, peerCount }: Props) {
  const statusColors: Record<string, string> = {
    offline: 'bg-red-500',
    connecting: 'bg-yellow-500',
    synced: 'bg-green-500'
  }

  const statusLabels: Record<string, string> = {
    offline: 'Offline',
    connecting: 'Connecting...',
    synced: `${peerCount} peer${peerCount !== 1 ? 's' : ''}`
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-text-secondary"
      title={`${status} - ${peerCount} peers`}
    >
      <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      <span>{statusLabels[status]}</span>
    </div>
  )
}
