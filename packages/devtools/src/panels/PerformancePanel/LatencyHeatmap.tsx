/**
 * LatencyHeatmap — a time × latency-bucket heat map of recent traces
 * (exploration 0226). Each cell's opacity scales with how many traces landed in
 * that latency band during that time slice, revealing the distribution modes,
 * drift, and outliers that the flat "recent traces" list hides.
 *
 * Hand-rolled SVG (the HabitHeatmap / Waterfall precedent) so it stays
 * dependency-free and assertable under jsdom — the charts package is canvas.
 */

import type { DevToolsTrace } from '../../core/types'
import React from 'react'
import { LATENCY_ROW_LABELS, latencyHeatmap, type HeatmapGrid } from './aggregate'

const CELL = 10
const GAP = 1
const LABEL_W = 30
const PAD = 4
// Hex literal (not a CSS var) to match the Waterfall in this panel: the theme
// tokens are raw HSL channels, so `var(--accent-ink)` is not a valid fill.
const HEAT_FILL = '#1c7ed6'

export interface LatencyHeatmapProps {
  traces: readonly DevToolsTrace[]
  /** Number of time columns. */
  columns?: number
  /** Window length in ms (x-axis span). */
  windowMs?: number
  /** Right edge of the time axis; defaults to Date.now() at render. */
  now?: number
}

export function LatencyHeatmap({
  traces,
  columns = 30,
  windowMs = 60_000,
  now
}: LatencyHeatmapProps): React.ReactElement {
  const at = now ?? (typeof Date !== 'undefined' ? Date.now() : 0)
  const data: HeatmapGrid = latencyHeatmap(traces, { columns, now: at, windowMs })
  const rows = data.rows
  const w = LABEL_W + columns * (CELL + GAP) + PAD
  const h = rows * (CELL + GAP) + PAD

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Trace latency over the last ${Math.round(windowMs / 1000)}s, ${data.total} traces`}
      data-testid="latency-heatmap"
    >
      {data.grid.map((rowCounts, r) => {
        // Row 0 is the smallest bucket — draw it at the bottom (Gregg convention).
        const y = (rows - 1 - r) * (CELL + GAP)
        return (
          <g key={r}>
            <text x={0} y={y + CELL} fontSize={8} fill="#868e96">
              {LATENCY_ROW_LABELS[r]}
            </text>
            {rowCounts.map((count, c) => (
              <rect
                key={c}
                data-testid="heat-cell"
                x={LABEL_W + c * (CELL + GAP)}
                y={y}
                width={CELL}
                height={CELL}
                rx={1}
                fill={HEAT_FILL}
                opacity={count === 0 ? 0.06 : 0.2 + 0.8 * (count / Math.max(data.max, 1))}
              >
                <title>{`${LATENCY_ROW_LABELS[r]} ms · ${count} trace${count === 1 ? '' : 's'}`}</title>
              </rect>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
