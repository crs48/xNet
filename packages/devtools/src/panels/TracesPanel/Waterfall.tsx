/**
 * Waterfall — a hand-rolled SVG timeline of a trace's spans (exploration 0190).
 *
 * Each span is a horizontal bar placed by its offset and width by its duration,
 * coloured by stage. Hand-rolled SVG (the HabitHeatmap precedent) keeps this
 * dependency-free and jsdom-testable — the charts package is canvas/ECharts and
 * cannot render in headless tests.
 */

import type { DevToolsTrace, DevToolsTraceSpan } from '../../core/types'
import React from 'react'

const ROW_HEIGHT = 18
const LABEL_WIDTH = 150
const BAR_AREA_WIDTH = 360
const PADDING = 8

/** Stable colour per stage family, derived from the name prefix. */
export function colourForStage(name: string): string {
  if (name.includes('sqlite')) return '#e8590c' // storage — hot
  if (name.includes('rpc')) return '#1c7ed6' // worker hop
  if (name.includes('hydrate') || name.includes('auth')) return '#7048e8'
  if (name.includes('encrypt') || name.includes('persist')) return '#2f9e44'
  if (name.includes('flatten') || name.includes('commit')) return '#f08c00'
  if (name.includes('bridge')) return '#868e96'
  return '#495057'
}

export interface WaterfallProps {
  trace: DevToolsTrace
  /** Total SVG width budget. Defaults to label + bar area + padding. */
  width?: number
}

export function Waterfall({ trace, width }: WaterfallProps): React.ReactElement {
  const spans = trace.spans
  const total = Math.max(trace.totalMs, ...spans.map((s) => s.startOffsetMs + s.durationMs), 1)
  const scale = BAR_AREA_WIDTH / total
  const svgWidth = width ?? LABEL_WIDTH + BAR_AREA_WIDTH + PADDING * 2
  const svgHeight = Math.max(spans.length, 1) * ROW_HEIGHT + PADDING * 2

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      role="img"
      aria-label={`Waterfall for ${trace.rootName}, ${trace.totalMs.toFixed(1)}ms`}
      data-testid="trace-waterfall"
    >
      {spans.length === 0 && (
        <text x={PADDING} y={PADDING + 12} fontSize={11} fill="#868e96">
          {trace.rootName} — {trace.totalMs.toFixed(1)}ms (no spans captured)
        </text>
      )}
      {spans.map((span: DevToolsTraceSpan, i: number) => {
        const y = PADDING + i * ROW_HEIGHT
        const x = LABEL_WIDTH + PADDING + span.startOffsetMs * scale
        const w = Math.max(span.durationMs * scale, 1)
        const fullScan = span.attributes?.fullTableScan === true
        return (
          <g key={span.spanId} data-testid="trace-span" data-span-name={span.name}>
            <text x={PADDING} y={y + 13} fontSize={10} fill="#495057">
              {shortLabel(span.name)}
            </text>
            <rect
              x={x}
              y={y + 3}
              width={w}
              height={ROW_HEIGHT - 6}
              rx={2}
              fill={colourForStage(span.name)}
            />
            {fullScan && (
              <text x={x + w + 3} y={y + 13} fontSize={10} fill="#e8590c">
                ⚠
              </text>
            )}
            <title>{spanTooltip(span)}</title>
          </g>
        )
      })}
    </svg>
  )
}

/** Trim the common `data.query.` / `data.mutate.` prefix for compact labels. */
function shortLabel(name: string): string {
  return name.replace(/^data\.(query|mutate)\./, '')
}

/** Build the hover tooltip for a span as a single string (SVG <title>). */
function spanTooltip(span: DevToolsTraceSpan): string {
  const parts = [`${span.name}: ${span.durationMs.toFixed(1)}ms`]
  if (span.attributes?.returnedRows != null) parts.push(`${span.attributes.returnedRows} rows`)
  if (span.attributes?.fullTableScan === true) parts.push('full table scan')
  return parts.join(' · ')
}
