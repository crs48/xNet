/**
 * Pure aggregation helpers for the Performance panel's flame graph and heat maps
 * (exploration 0226). No React, no DOM — every function here is unit-testable in
 * a plain `node` environment so the SVG components above stay thin.
 *
 *  - `bucketHeatmap` quantises timestamped values into a time(x) × value(y) grid
 *    of counts (Brendan Gregg's latency-heatmap recipe: fixed storage, reveals
 *    distribution modes/outliers a list hides).
 *  - `latencyHeatmap` / `frameHeatmap` adapt the trace ring / frame ring to it.
 *  - `aggregateFlame` merges every span across the trace ring into one
 *    stage-keyed, left-heavy tree ("where did total time go this session?").
 *  - `layoutFlame` flattens that tree into positioned cells for an SVG icicle.
 */

import type { DevToolsTrace, DevToolsTraceSpan } from '../../core/types'

// ─── Heat maps ───────────────────────────────────────────────────────────────

/** Half-open upper bounds (ms). A value `v` falls in the first bucket with `v < b`. */
export const LATENCY_BUCKETS_MS = [5, 20, 50, 100, 250, 500, Infinity] as const
export const LATENCY_ROW_LABELS = ['<5', '<20', '<50', '<100', '<250', '<500', '500+'] as const

/** Frame-time buckets keyed to 60fps (16.7ms) / 30fps (33ms) / jank thresholds. */
export const FRAME_BUCKETS_MS = [17, 33, 50, 100, Infinity] as const
export const FRAME_ROW_LABELS = ['<17', '<33', '<50', '<100', '100+'] as const

/** A timestamped scalar sample to be bucketed. */
export interface TimedSample {
  /** Wall-clock time of the sample (ms since epoch). */
  t: number
  /** The value to bucket on the y-axis (ms). */
  v: number
}

export interface HeatmapGrid {
  /** `grid[row][col]` = count of samples in that value-bucket × time-column. Row 0 = smallest bucket. */
  grid: number[][]
  /** Largest single-cell count (for colour scaling); 0 when empty. */
  max: number
  /** Total samples placed in the grid (within the window). */
  total: number
  columns: number
  rows: number
}

export interface HeatmapOptions {
  columns?: number
  /** Right edge of the time axis (defaults supplied by callers, never read implicitly). */
  now?: number
  /** How far back the x-axis reaches from `now`, in ms. */
  windowMs?: number
}

/**
 * Quantise samples into a time × value grid of counts. Newest time is the
 * right-most column; the smallest value bucket is row 0. Samples outside
 * `[now - windowMs, now]` are dropped (bounded storage regardless of volume).
 */
export function bucketHeatmap(
  samples: readonly TimedSample[],
  buckets: readonly number[],
  { columns = 30, now = 0, windowMs = 60_000 }: HeatmapOptions = {}
): HeatmapGrid {
  const rows = buckets.length
  const colMs = windowMs / columns
  const grid: number[][] = buckets.map(() => new Array<number>(columns).fill(0))
  let max = 0
  let total = 0
  for (const s of samples) {
    const age = now - s.t
    if (age < 0 || age >= windowMs) continue
    // age 0 → newest → right-most column (columns - 1).
    const col = Math.min(columns - 1, Math.max(0, Math.floor((windowMs - age) / colMs)))
    let row = buckets.findIndex((b) => s.v < b)
    if (row < 0) row = rows - 1 // value ≥ last finite bound and no Infinity sentinel
    const next = ++grid[row][col]
    if (next > max) max = next
    total++
  }
  return { grid, max, total, columns, rows }
}

/** Bucket recent traces into a latency-over-time heat map. */
export function latencyHeatmap(
  traces: readonly DevToolsTrace[],
  options: HeatmapOptions = {}
): HeatmapGrid {
  const samples: TimedSample[] = traces.map((t) => ({ t: t.startedAt, v: t.totalMs }))
  return bucketHeatmap(samples, LATENCY_BUCKETS_MS, options)
}

/** Bucket recent frame durations into a jank-over-time heat map. */
export function frameHeatmap(
  samples: readonly TimedSample[],
  options: HeatmapOptions = {}
): HeatmapGrid {
  return bucketHeatmap(samples, FRAME_BUCKETS_MS, options)
}

// ─── Flame graph ─────────────────────────────────────────────────────────────

export interface FlameNode {
  name: string
  /** Summed wall time for this frame across the whole ring (includes descendants). */
  totalMs: number
  /** `totalMs` minus the sum of children — time attributed to this frame alone. */
  selfMs: number
  /** How many spans merged into this frame. */
  count: number
  children: FlameNode[]
}

function findChild(parent: FlameNode, name: string): FlameNode {
  let node = parent.children.find((c) => c.name === name)
  if (!node) {
    node = { name, totalMs: 0, selfMs: 0, count: 0, children: [] }
    parent.children.push(node)
  }
  return node
}

/** Root→span stage path via the `parentSpanId` chain (cycle-guarded). */
function spanPath(span: DevToolsTraceSpan, byId: Map<string, DevToolsTraceSpan>): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let cur: DevToolsTraceSpan | undefined = span
  while (cur && !seen.has(cur.spanId)) {
    seen.add(cur.spanId)
    path.unshift(cur.name)
    cur = cur.parentSpanId ? byId.get(cur.parentSpanId) : undefined
  }
  return path
}

/**
 * Merge every span in the ring into a single left-heavy flame tree keyed by
 * stage name. Each span contributes its duration to exactly the node matching
 * its full stack path; ancestors accrue their own spans' durations on their own
 * iterations. The synthetic root's width is the summed wall-clock of the ring,
 * so its `selfMs` reads as time not covered by any captured span (uninstrumented).
 */
export function aggregateFlame(traces: readonly DevToolsTrace[]): FlameNode {
  const root: FlameNode = { name: 'all operations', totalMs: 0, selfMs: 0, count: 0, children: [] }
  for (const trace of traces) {
    root.totalMs += trace.totalMs
    root.count += 1
    const byId = new Map(trace.spans.map((s) => [s.spanId, s]))
    for (const span of trace.spans) {
      const path = spanPath(span, byId)
      let node = root
      for (let i = 0; i < path.length; i++) {
        node = findChild(node, path[i])
        if (i === path.length - 1) {
          node.totalMs += span.durationMs
          node.count += 1
        }
      }
    }
  }
  finishNode(root)
  return root
}

/** Compute `selfMs` bottom-up and sort children widest-first (left-heavy). */
function finishNode(node: FlameNode): void {
  let childSum = 0
  for (const child of node.children) {
    finishNode(child)
    childSum += child.totalMs
  }
  node.selfMs = Math.max(0, node.totalMs - childSum)
  node.children.sort((a, b) => b.totalMs - a.totalMs)
}

export interface FlameCell {
  name: string
  depth: number
  /** Left edge in px. */
  x: number
  /** Width in px (≥ 1 so thin frames stay visible). */
  width: number
  totalMs: number
  selfMs: number
  count: number
}

/**
 * Flatten a flame tree into positioned cells for an SVG icicle. Children are
 * laid out left-to-right within their parent's pixel span, proportional to
 * `totalMs`; the unattributed (self) remainder stays as bare parent at the right.
 */
export function layoutFlame(
  root: FlameNode,
  pixelWidth: number,
  { includeRoot = true, minWidth = 1 }: { includeRoot?: boolean; minWidth?: number } = {}
): FlameCell[] {
  const cells: FlameCell[] = []
  const walk = (node: FlameNode, depth: number, x: number, width: number): void => {
    if (depth >= 0) {
      cells.push({
        name: node.name,
        depth,
        x,
        width: Math.max(width, minWidth),
        totalMs: node.totalMs,
        selfMs: node.selfMs,
        count: node.count
      })
    }
    if (node.totalMs <= 0) return
    let cursor = x
    for (const child of node.children) {
      const cw = (child.totalMs / node.totalMs) * width
      walk(child, depth + 1, cursor, cw)
      cursor += cw
    }
  }
  walk(root, includeRoot ? 0 : -1, 0, pixelWidth)
  return cells
}

/** Max depth of a flame tree (root = depth 0). Drives SVG height. */
export function flameDepth(node: FlameNode): number {
  if (node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map(flameDepth))
}
