/**
 * PresenceDot — Discord-style status dot for a user's presence (0198).
 * active → green, idle → amber, dnd → red, unknown/offline → muted.
 */
import type { PresenceStatus } from '@xnetjs/comms'
import { cn } from '@xnetjs/ui'

const STATUS_CLASS: Record<PresenceStatus, string> = {
  active: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-destructive'
}

const STATUS_LABEL: Record<PresenceStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  dnd: 'Do not disturb'
}

export function PresenceDot({
  status,
  ring = true,
  className
}: {
  status?: PresenceStatus
  /** Draw a surface-coloured ring so the dot reads on top of an avatar. */
  ring?: boolean
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={status ? STATUS_LABEL[status] : 'Offline'}
      className={cn(
        'block h-2.5 w-2.5 rounded-full',
        status ? STATUS_CLASS[status] : 'bg-ink-3',
        ring && 'ring-2 ring-surface-0',
        className
      )}
    />
  )
}
