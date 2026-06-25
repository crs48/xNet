/**
 * FlameGraph — an aggregated, left-heavy flame graph of every span in the trace
 * ring (exploration 0226). Width ∝ summed `durationMs` for that stage across the
 * session; the widest tower is the costliest stage. Answers "where did total
 * time go?" — the view the per-trace waterfall can't give.
 *
 * Hand-rolled SVG icicle (depth grows downward) so it stays dependency-free and
 * jsdom-assertable. Reuses `colourForStage` so colours match the Waterfall.
 */

import type { DevToolsTrace } from '../../core/types'
import React from 'react'
import { formatDuration } from '../../utils/formatters'
import { colourForStage } from '../TracesPanel/Waterfall'
import { aggregateFlame, flameDepth, layoutFlame } from './aggregate'

const ROW_HEIGHT = 18
const PAD = 4

export interface FlameGraphProps {
  traces: readonly DevToolsTrace[]
  /** Total SVG width budget. */
  width?: number
}

export function FlameGraph({ traces, width = 420 }: FlameGraphProps): React.ReactElement {
  const root = aggregateFlame(traces)
  const innerWidth = width - PAD * 2
  const cells = layoutFlame(root, innerWidth, { includeRoot: true })
  const depth = flameDepth(root)
  const svgHeight = (depth + 1) * ROW_HEIGHT + PAD * 2

  if (root.totalMs <= 0) {
    return (
      <svg
        width={width}
        height={ROW_HEIGHT + PAD * 2}
        role="img"
        aria-label="Aggregated flame graph (no traces)"
        data-testid="flame-graph"
      >
        <text x={PAD} y={PAD + 12} fontSize={11} fill="#868e96">
          No traces captured — run a query or mutation with tracing enabled.
        </text>
      </svg>
    )
  }

  return (
    <svg
      width={width}
      height={svgHeight}
      viewBox={`0 0 ${width} ${svgHeight}`}
      role="img"
      aria-label={`Aggregated flame graph, ${formatDuration(root.totalMs)} across ${root.count} traces`}
      data-testid="flame-graph"
    >
      {cells.map((cell, i) => {
        const y = PAD + cell.depth * ROW_HEIGHT
        const fill = cell.depth === 0 ? '#343a40' : colourForStage(cell.name)
        return (
          <g
            key={`${cell.name}-${cell.depth}-${i}`}
            data-testid="flame-cell"
            data-frame-name={cell.name}
          >
            <rect
              x={PAD + cell.x}
              y={y}
              width={cell.width}
              height={ROW_HEIGHT - 2}
              rx={2}
              fill={fill}
              opacity={cell.depth === 0 ? 0.9 : 0.85}
            />
            {cell.width > 36 && (
              <text x={PAD + cell.x + 3} y={y + 12} fontSize={9} fill="#f1f3f5" clipPath="inset(0)">
                {shortLabel(cell.name)}
              </text>
            )}
            <title>{frameTooltip(cell.name, cell.totalMs, cell.selfMs, cell.count)}</title>
          </g>
        )
      })}
    </svg>
  )
}

function shortLabel(name: string): string {
  return name.replace(/^data\.(query|mutate)\./, '')
}

function frameTooltip(name: string, totalMs: number, selfMs: number, count: number): string {
  const parts = [`${name}: ${formatDuration(totalMs)} total`]
  if (selfMs > 0 && selfMs !== totalMs) parts.push(`${formatDuration(selfMs)} self`)
  parts.push(`${count} span${count === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
