/**
 * TaskStatusIcon - Linear-style workflow state glyph.
 *
 * A ring whose fill reflects the workflow category: empty (unstarted),
 * dashed (triage/backlog), half (started), full check (completed),
 * crossed (cancelled). Color comes from TASK_STATUS_META.
 */
import { cn } from '../../utils'
import { getTaskStatusMeta } from './types'

export interface TaskStatusIconProps {
  status?: string
  size?: number
  className?: string
}

export function TaskStatusIcon({ status, size = 14, className }: TaskStatusIconProps) {
  const meta = getTaskStatusMeta(status)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={cn('shrink-0', meta.colorClass, className)}
      aria-label={meta.name}
      role="img"
    >
      {meta.category === 'triage' || meta.category === 'backlog' ? (
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.5 2"
        />
      ) : (
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {meta.category === 'started' && (
        <path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill="currentColor" />
      )}
      {meta.category === 'completed' && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="currentColor" stroke="none" />
          <path
            d="M4.5 7.2 L6.2 8.9 L9.6 5.3"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {meta.category === 'cancelled' && (
        <path
          d="M4.8 4.8 L9.2 9.2 M9.2 4.8 L4.8 9.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export interface TaskPriorityIconProps {
  priority?: string
  size?: number
  className?: string
}

/** Linear-style priority bars (low/medium/high) and urgent exclamation. */
export function TaskPriorityIcon({ priority, size = 14, className }: TaskPriorityIconProps) {
  if (!priority || priority === 'medium') return null

  if (priority === 'urgent') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        className={cn('shrink-0 text-destructive', className)}
        aria-label="Urgent"
        role="img"
      >
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.5 V8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10.4" r="0.9" fill="white" />
      </svg>
    )
  }

  const bars = priority === 'high' ? 3 : priority === 'low' ? 1 : 2

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={cn('shrink-0 text-foreground-muted', className)}
      aria-label={`Priority: ${priority}`}
      role="img"
    >
      <rect x="1.5" y="8" width="2.6" height="4.5" rx="1" fill="currentColor" opacity="1" />
      <rect
        x="5.7"
        y="5.5"
        width="2.6"
        height="7"
        rx="1"
        fill="currentColor"
        opacity={bars >= 2 ? 1 : 0.3}
      />
      <rect
        x="9.9"
        y="3"
        width="2.6"
        height="9.5"
        rx="1"
        fill="currentColor"
        opacity={bars >= 3 ? 1 : 0.3}
      />
    </svg>
  )
}
