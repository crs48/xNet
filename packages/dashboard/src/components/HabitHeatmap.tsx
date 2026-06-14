/**
 * GitHub-style contribution heatmap for a habit (exploration 0180). One cell
 * per day, columns are weeks, rows are weekdays. Pure presentational — give it
 * the set of completed canonical days and the window length. Reused by the
 * Today panel and the streak-heatmap dashboard widget.
 */
import type { JSX } from 'react'
import { addDays, canonicalDay, dayToIso, weekStart } from '@xnetjs/experiments'

export interface HabitHeatmapProps {
  /** Completed canonical days (UTC-midnight ms). */
  completedDays: Set<number>
  /** Days due but not completed, drawn faintly (optional). */
  scheduledDays?: Set<number>
  /** How many weeks to show (default 12). */
  weeks?: number
  /** Cell edge in px (default 11). */
  cell?: number
  /** Accent color for completed cells (CSS color). Defaults to the primary token. */
  color?: string
  today?: number
}

export function HabitHeatmap({
  completedDays,
  scheduledDays,
  weeks = 12,
  cell = 11,
  color,
  today = canonicalDay()
}: HabitHeatmapProps): JSX.Element {
  const gap = 2
  const start = weekStart(addDays(today, -(weeks - 1) * 7))
  const columns: number[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: number[] = []
    for (let d = 0; d < 7; d++) col.push(addDays(start, w * 7 + d))
    columns.push(col)
  }

  const accent = color ?? 'var(--primary, #6366f1)'
  const width = weeks * (cell + gap)
  const height = 7 * (cell + gap)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Habit completion heatmap"
    >
      {columns.map((col, w) =>
        col.map((d, r) => {
          if (d > today) return null
          const done = completedDays.has(d)
          const due = scheduledDays?.has(d) ?? false
          const fill = done ? accent : due ? 'var(--muted, #e5e7eb)' : 'var(--accent, #f1f1f1)'
          const opacity = done ? 1 : due ? 0.6 : 0.35
          return (
            <rect
              key={dayToIso(d)}
              x={w * (cell + gap)}
              y={r * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              fill={fill}
              opacity={opacity}
            >
              <title>{`${dayToIso(d)} — ${done ? 'done' : due ? 'missed' : '—'}`}</title>
            </rect>
          )
        })
      )}
    </svg>
  )
}
