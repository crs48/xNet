/**
 * DemoQuotaIndicator - Shows storage quota usage for demo mode
 *
 * Displays a progress bar with bytes used / limit.
 * Colors change at warning (80%) and critical (95%) thresholds.
 */

import { formatBytes } from '@xnetjs/core'

export interface DemoQuotaIndicatorProps {
  /** Bytes currently used */
  usedBytes: number
  /** Total quota limit in bytes */
  limitBytes: number
}

/**
 * DemoQuotaIndicator component
 *
 * @example
 * ```tsx
 * <DemoQuotaIndicator usedBytes={5242880} limitBytes={10485760} />
 * ```
 */
export function DemoQuotaIndicator({ usedBytes, limitBytes }: DemoQuotaIndicatorProps) {
  const percentage = Math.round((usedBytes / limitBytes) * 100)
  const isWarning = percentage >= 80
  const isCritical = percentage >= 95

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className={isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : ''}>
        {formatBytes(usedBytes)} / {formatBytes(limitBytes)}
      </span>
    </div>
  )
}
