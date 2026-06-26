/**
 * FlameChart — a per-trace, time-ordered flame chart (exploration 0226). Unlike
 * the flat `Waterfall` (one row per span by array index), this nests spans by
 * their `parentSpanId` so depth reflects the real call tree and self-time is
 * visible: x = startOffset, width = duration, y = stack depth.
 *
 * Hand-rolled SVG (the Waterfall precedent) — dependency-free and jsdom-testable.
 * Reuses `colourForStage` so colours match the Waterfall and aggregated graph.
 */

import type { DevToolsTrace, DevToolsTraceSpan } from '../../core/types'
import React from 'react'
import { colourForStage } from './Waterfall'

const ROW_HEIGHT = 18
const BAR_AREA_WIDTH = 420
const PADDING = 8

interface PlacedSpan {
  span: DevToolsTraceSpan
  depth: number
  selfMs: number
}

/** Depth of each span via its parent chain; orphans (missing parent) sit at 0. */
function placeSpans(spans: readonly DevToolsTraceSpan[]): PlacedSpan[] {
  const byId = new Map(spans.map((s) => [s.spanId, s]))
  const depthOf = (span: DevToolsTraceSpan): number => {
    let depth = 0
    const seen = new Set<string>([span.spanId])
    let cur = span.parentSpanId ? byId.get(span.parentSpanId) : undefined
    while (cur && !seen.has(cur.spanId)) {
      seen.add(cur.spanId)
      depth++
      cur = cur.parentSpanId ? byId.get(cur.parentSpanId) : undefined
    }
    return depth
  }
  // Self time = own duration minus the duration of direct children.
  const childSum = new Map<string, number>()
  for (const s of spans) {
    if (s.parentSpanId && byId.has(s.parentSpanId)) {
      childSum.set(s.parentSpanId, (childSum.get(s.parentSpanId) ?? 0) + s.durationMs)
    }
  }
  return spans.map((span) => ({
    span,
    depth: depthOf(span),
    selfMs: Math.max(0, span.durationMs - (childSum.get(span.spanId) ?? 0))
  }))
}

export interface FlameChartProps {
  trace: DevToolsTrace
  width?: number
}

export function FlameChart({ trace, width }: FlameChartProps): React.ReactElement {
  const placed = placeSpans(trace.spans)
  const total = Math.max(
    trace.totalMs,
    ...trace.spans.map((s) => s.startOffsetMs + s.durationMs),
    1
  )
  const scale = BAR_AREA_WIDTH / total
  const maxDepth = placed.reduce((m, p) => Math.max(m, p.depth), 0)
  const svgWidth = width ?? BAR_AREA_WIDTH + PADDING * 2
  const svgHeight = (maxDepth + 1) * ROW_HEIGHT + PADDING * 2

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      role="img"
      aria-label={`Flame chart for ${trace.rootName}, ${trace.totalMs.toFixed(1)}ms`}
      data-testid="trace-flamechart"
    >
      {placed.length === 0 && (
        <text x={PADDING} y={PADDING + 12} fontSize={11} fill="#868e96">
          {trace.rootName} — {trace.totalMs.toFixed(1)}ms (no spans captured)
        </text>
      )}
      {placed.map(({ span, depth, selfMs }) => {
        const y = PADDING + depth * ROW_HEIGHT
        const x = PADDING + span.startOffsetMs * scale
        const w = Math.max(span.durationMs * scale, 1)
        const fullScan = span.attributes?.fullTableScan === true
        return (
          <g
            key={span.spanId}
            data-testid="flame-span"
            data-span-name={span.name}
            data-depth={depth}
          >
            <rect
              x={x}
              y={y + 2}
              width={w}
              height={ROW_HEIGHT - 4}
              rx={2}
              fill={colourForStage(span.name)}
              opacity={0.9}
            />
            {w > 30 && (
              <text x={x + 3} y={y + 13} fontSize={9} fill="#f1f3f5">
                {shortLabel(span.name)}
              </text>
            )}
            {fullScan && (
              <text x={x + w + 3} y={y + 13} fontSize={10} fill="#e8590c">
                ⚠
              </text>
            )}
            <title>{spanTooltip(span, selfMs)}</title>
          </g>
        )
      })}
    </svg>
  )
}

function shortLabel(name: string): string {
  return name.replace(/^data\.(query|mutate)\./, '')
}

function spanTooltip(span: DevToolsTraceSpan, selfMs: number): string {
  const parts = [`${span.name}: ${span.durationMs.toFixed(1)}ms`]
  if (selfMs > 0 && selfMs !== span.durationMs) parts.push(`${selfMs.toFixed(1)}ms self`)
  if (span.attributes?.returnedRows != null) parts.push(`${span.attributes.returnedRows} rows`)
  if (span.attributes?.fullTableScan === true) parts.push('full table scan')
  return parts.join(' · ')
}
