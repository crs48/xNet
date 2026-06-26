/**
 * FrameHeatmap — a time × frame-duration heat map (exploration 0226). Turns the
 * single instantaneous FPS number into session jank history: each cell counts
 * how many frames fell in that duration band during that time slice, so a paste
 * that dropped six frames stays visible after it scrolls past.
 *
 * Hand-rolled SVG (HabitHeatmap precedent) — dependency-free, jsdom-assertable.
 */

import React from 'react'
import { FRAME_ROW_LABELS, frameHeatmap, type HeatmapGrid, type TimedSample } from './aggregate'

const CELL = 10
const GAP = 1
const LABEL_W = 30
const PAD = 4
// Hex literals (not CSS vars): theme tokens are raw HSL channels, invalid as a
// direct `fill`. Fast frames read calm-blue; jank rows read warning-orange.
const FAST_FILL = '#1c7ed6'
const JANK_FILL = '#e8590c'

export interface FrameHeatmapProps {
  samples: readonly TimedSample[]
  columns?: number
  windowMs?: number
  now?: number
}

export function FrameHeatmap({
  samples,
  columns = 30,
  windowMs = 30_000,
  now
}: FrameHeatmapProps): React.ReactElement {
  const at = now ?? (typeof Date !== 'undefined' ? Date.now() : 0)
  const data: HeatmapGrid = frameHeatmap(samples, { columns, now: at, windowMs })
  const rows = data.rows
  const w = LABEL_W + columns * (CELL + GAP) + PAD
  const h = rows * (CELL + GAP) + PAD

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Frame durations over the last ${Math.round(windowMs / 1000)}s, ${data.total} frames`}
      data-testid="frame-heatmap"
    >
      {data.grid.map((rowCounts, r) => {
        // Row 0 (fastest frames) at the bottom; jank rises to the top.
        const y = (rows - 1 - r) * (CELL + GAP)
        // Slow frames read as warning; fast frames as the neutral accent.
        const slow = r >= 2
        return (
          <g key={r}>
            <text x={0} y={y + CELL} fontSize={8} fill="#868e96">
              {FRAME_ROW_LABELS[r]}
            </text>
            {rowCounts.map((count, c) => (
              <rect
                key={c}
                data-testid="frame-cell"
                x={LABEL_W + c * (CELL + GAP)}
                y={y}
                width={CELL}
                height={CELL}
                rx={1}
                fill={slow ? JANK_FILL : FAST_FILL}
                opacity={count === 0 ? 0.06 : 0.2 + 0.8 * (count / Math.max(data.max, 1))}
              >
                <title>{`${FRAME_ROW_LABELS[r]} ms · ${count} frame${count === 1 ? '' : 's'}`}</title>
              </rect>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
