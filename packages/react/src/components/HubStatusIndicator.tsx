/**
 * HubStatusIndicator - Simple hub connection indicator.
 */
import { useHubStatus } from '../hooks/useHubStatus'

const STATUS_CONFIG = {
  disconnected: { color: 'var(--muted)', label: 'Offline' },
  connecting: { color: 'var(--warning)', label: 'Connecting...' },
  connected: { color: 'var(--success)', label: 'Synced to hub' },
  error: { color: 'var(--destructive)', label: 'Connection error' }
} as const

export function HubStatusIndicator(): JSX.Element {
  const status = useHubStatus()
  const config = STATUS_CONFIG[status]

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
      title={config.label}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color,
          display: 'inline-block',
          animation: status === 'connecting' ? 'pulse 1.5s infinite' : undefined
        }}
      />
      <span style={{ color: 'var(--muted-foreground)' }}>{config.label}</span>
    </div>
  )
}
