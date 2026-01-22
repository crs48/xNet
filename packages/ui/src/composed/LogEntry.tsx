import type { ReactNode } from 'react'
import { cn } from '../utils'

export interface LogEntryProps {
  timestamp: number | string
  direction?: 'in' | 'out' | 'info' | 'error' | 'success'
  message: string | ReactNode
  detail?: string
  className?: string
}

const directionConfig = {
  in: { arrow: '\u2190', color: 'text-chart-2' },
  out: { arrow: '\u2192', color: 'text-chart-1' },
  info: { arrow: '\u25CF', color: 'text-muted-foreground' },
  error: { arrow: '!', color: 'text-destructive' },
  success: { arrow: '\u2713', color: 'text-success' }
}

function formatTime(ts: number | string): string {
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function LogEntry({
  timestamp,
  direction = 'info',
  message,
  detail,
  className
}: LogEntryProps) {
  const config = directionConfig[direction]

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-0.5 font-mono text-[11px] hover:bg-accent/50',
        className
      )}
    >
      <span className="text-muted-foreground w-14 shrink-0 text-right">
        {formatTime(timestamp)}
      </span>
      <span className={cn('w-3 text-center shrink-0', config.color)}>{config.arrow}</span>
      <span className="text-foreground flex-1 break-all">{message}</span>
      {detail && <span className="text-muted-foreground shrink-0 text-[10px]">{detail}</span>}
    </div>
  )
}
