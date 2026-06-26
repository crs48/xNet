/**
 * Tests for the Performance panel's flame graph + heat maps (exploration 0226).
 * Pure aggregation is unit-tested in a plain environment; the SVG components are
 * rendered with react-dom/server (devtools has no @testing-library/react), the
 * same approach as tracing-waterfall.test.tsx.
 */
import type { DevToolsTrace, DevToolsTraceSpan } from '../src/core/types'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import {
  aggregateFlame,
  bucketHeatmap,
  flameDepth,
  frameHeatmap,
  latencyHeatmap,
  layoutFlame,
  LATENCY_BUCKETS_MS,
  type TimedSample
} from '../src/panels/PerformancePanel/aggregate'
import { FlameGraph } from '../src/panels/PerformancePanel/FlameGraph'
import { FrameHeatmap } from '../src/panels/PerformancePanel/FrameHeatmap'
import { LatencyHeatmap } from '../src/panels/PerformancePanel/LatencyHeatmap'
import { FlameChart } from '../src/panels/TracesPanel/FlameChart'

function span(over: Partial<DevToolsTraceSpan> & { spanId: string }): DevToolsTraceSpan {
  return { name: 'data.query.sqlite', startOffsetMs: 0, durationMs: 1, ...over }
}

function makeTrace(over: Partial<DevToolsTrace> = {}): DevToolsTrace {
  return {
    traceId: 't1',
    rootKind: 'query',
    rootName: 'query:Task.list',
    startedAt: 1000,
    totalMs: 41,
    spans: [],
    ...over
  }
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

// ─── bucketHeatmap ─────────────────────────────────────────────────────────

describe('bucketHeatmap', () => {
  it('places samples into the right time column and value row', () => {
    const samples: TimedSample[] = [
      { t: 10_000, v: 3 }, // newest, smallest bucket
      { t: 100, v: 600 } // oldest within window, largest bucket
    ]
    const { grid, max, total, rows, columns } = bucketHeatmap(samples, LATENCY_BUCKETS_MS, {
      columns: 10,
      now: 10_000,
      windowMs: 10_000
    })
    expect(rows).toBe(LATENCY_BUCKETS_MS.length)
    expect(columns).toBe(10)
    expect(total).toBe(2)
    expect(max).toBe(1)
    // v=3 → row 0; age 0 → last column.
    expect(grid[0][9]).toBe(1)
    // v=600 → last row; age 9_900 → first column.
    expect(grid[grid.length - 1][0]).toBe(1)
    // a sample exactly at the window edge (age === windowMs) is dropped.
    const edge = bucketHeatmap([{ t: 0, v: 1 }], LATENCY_BUCKETS_MS, {
      columns: 10,
      now: 10_000,
      windowMs: 10_000
    })
    expect(edge.total).toBe(0)
  })

  it('drops samples outside the window and counts max correctly', () => {
    const samples: TimedSample[] = [
      { t: 5_000, v: 10 },
      { t: 5_100, v: 12 }, // same column + row as above
      { t: -50, v: 10 } // before window → dropped
    ]
    const { grid, max, total } = bucketHeatmap(samples, LATENCY_BUCKETS_MS, {
      columns: 4,
      now: 6_000,
      windowMs: 6_000
    })
    expect(total).toBe(2)
    expect(max).toBe(2)
    // both land in row 1 (5 <= v < 20)
    const rowOneTotal = grid[1].reduce((a, b) => a + b, 0)
    expect(rowOneTotal).toBe(2)
  })

  it('is empty (max 0) with no samples', () => {
    const { max, total, grid } = bucketHeatmap([], LATENCY_BUCKETS_MS, { now: 0 })
    expect(max).toBe(0)
    expect(total).toBe(0)
    expect(grid.every((row) => row.every((c) => c === 0))).toBe(true)
  })
})

describe('latencyHeatmap / frameHeatmap adapters', () => {
  it('latencyHeatmap maps trace startedAt/totalMs', () => {
    const traces = [
      makeTrace({ startedAt: 9_000, totalMs: 4 }),
      makeTrace({ traceId: 't2', startedAt: 9_500, totalMs: 300 })
    ]
    const { total, grid } = latencyHeatmap(traces, { now: 10_000, windowMs: 10_000, columns: 10 })
    expect(total).toBe(2)
    expect(grid[0].reduce((a, b) => a + b, 0)).toBe(1) // the 4ms trace, row 0
  })

  it('frameHeatmap buckets long frames into the jank rows', () => {
    const samples: TimedSample[] = [
      { t: 1_000, v: 8 }, // <17
      { t: 1_100, v: 120 } // 100+
    ]
    const { grid, total } = frameHeatmap(samples, { now: 2_000, windowMs: 2_000, columns: 5 })
    expect(total).toBe(2)
    expect(grid[0].reduce((a, b) => a + b, 0)).toBe(1)
    expect(grid[grid.length - 1].reduce((a, b) => a + b, 0)).toBe(1)
  })
})

// ─── aggregateFlame ────────────────────────────────────────────────────────

describe('aggregateFlame', () => {
  it('sums each stage across the ring and sorts widest-first (left-heavy)', () => {
    const traces = [
      makeTrace({
        totalMs: 30,
        spans: [
          span({ spanId: 'a', name: 'data.query.sqlite', durationMs: 20 }),
          span({ spanId: 'b', name: 'data.query.commit', durationMs: 5 })
        ]
      }),
      makeTrace({
        traceId: 't2',
        totalMs: 10,
        spans: [span({ spanId: 'c', name: 'data.query.sqlite', durationMs: 8 })]
      })
    ]
    const root = aggregateFlame(traces)
    expect(root.totalMs).toBe(40) // 30 + 10 wall clock
    expect(root.count).toBe(2)
    expect(root.children.map((c) => c.name)).toEqual(['data.query.sqlite', 'data.query.commit'])
    expect(root.children[0].totalMs).toBe(28) // 20 + 8
    expect(root.children[0].count).toBe(2)
    expect(root.children[1].totalMs).toBe(5)
  })

  it('nests by parentSpanId and computes self time', () => {
    const traces = [
      makeTrace({
        totalMs: 100,
        spans: [
          span({ spanId: 'root', name: 'data.query.bridge', durationMs: 100 }),
          span({ spanId: 'child', name: 'data.query.sqlite', durationMs: 30, parentSpanId: 'root' })
        ]
      })
    ]
    const root = aggregateFlame(traces)
    const bridge = root.children.find((c) => c.name === 'data.query.bridge')!
    expect(bridge.totalMs).toBe(100)
    expect(bridge.selfMs).toBe(70) // 100 - 30 child
    expect(bridge.children[0].name).toBe('data.query.sqlite')
    expect(bridge.children[0].totalMs).toBe(30)
  })

  it('guards against a cyclic parent chain', () => {
    const traces = [
      makeTrace({
        spans: [
          span({ spanId: 'x', parentSpanId: 'y', durationMs: 2 }),
          span({ spanId: 'y', parentSpanId: 'x', durationMs: 3 })
        ]
      })
    ]
    expect(() => aggregateFlame(traces)).not.toThrow()
  })

  it('handles an empty ring', () => {
    const root = aggregateFlame([])
    expect(root.totalMs).toBe(0)
    expect(root.children).toHaveLength(0)
    expect(flameDepth(root)).toBe(0)
  })
})

describe('layoutFlame', () => {
  it('lays children proportionally within the parent pixel span', () => {
    const traces = [
      makeTrace({
        totalMs: 40,
        spans: [
          span({ spanId: 'a', name: 'data.query.sqlite', durationMs: 30 }),
          span({ spanId: 'b', name: 'data.query.commit', durationMs: 10 })
        ]
      })
    ]
    const root = aggregateFlame(traces)
    const cells = layoutFlame(root, 400)
    const rootCell = cells.find((c) => c.depth === 0)!
    expect(rootCell.width).toBe(400)
    const sqlite = cells.find((c) => c.name === 'data.query.sqlite')!
    const commit = cells.find((c) => c.name === 'data.query.commit')!
    // sqlite 30/40 = 300px starting at x 0; commit 10/40 = 100px after it.
    expect(Math.round(sqlite.width)).toBe(300)
    expect(Math.round(commit.x)).toBe(300)
  })
})

// ─── SVG components (jsdom-free, react-dom/server) ──────────────────────────

describe('LatencyHeatmap component', () => {
  it('renders a cell per bucket × column with counts in titles', () => {
    const traces = [makeTrace({ startedAt: 9_900, totalMs: 30 })]
    const html = renderToStaticMarkup(
      <LatencyHeatmap traces={traces} now={10_000} columns={5} windowMs={10_000} />
    )
    expect(html).toContain('data-testid="latency-heatmap"')
    expect(count(html, 'data-testid="heat-cell"')).toBe(LATENCY_BUCKETS_MS.length * 5)
    expect(html).toContain('1 trace')
  })

  it('renders without throwing when there are no traces', () => {
    const html = renderToStaticMarkup(<LatencyHeatmap traces={[]} now={0} />)
    expect(html).toContain('data-testid="latency-heatmap"')
    expect(html).toContain('0 traces')
  })
})

describe('FrameHeatmap component', () => {
  it('renders frame cells and a frame count', () => {
    const samples: TimedSample[] = [{ t: 990, v: 8 }]
    const html = renderToStaticMarkup(
      <FrameHeatmap samples={samples} now={1_000} columns={4} windowMs={1_000} />
    )
    expect(html).toContain('data-testid="frame-heatmap"')
    expect(html).toContain('1 frame')
  })
})

describe('FlameGraph component', () => {
  it('renders a frame per stage with the root and a tooltip', () => {
    const traces = [
      makeTrace({
        totalMs: 30,
        spans: [span({ spanId: 'a', name: 'data.query.sqlite', durationMs: 20 })]
      })
    ]
    const html = renderToStaticMarkup(<FlameGraph traces={traces} />)
    expect(html).toContain('data-testid="flame-graph"')
    // root + one stage frame
    expect(count(html, 'data-testid="flame-cell"')).toBe(2)
    expect(html).toContain('data-frame-name="data.query.sqlite"')
  })

  it('degrades to an empty-state label with no traces', () => {
    const html = renderToStaticMarkup(<FlameGraph traces={[]} />)
    expect(html).toContain('data-testid="flame-graph"')
    expect(html).toContain('No traces captured')
    expect(count(html, 'data-testid="flame-cell"')).toBe(0)
  })
})

describe('FlameChart component', () => {
  it('nests spans by depth from parentSpanId', () => {
    const trace = makeTrace({
      totalMs: 100,
      spans: [
        span({ spanId: 'root', name: 'data.query.bridge', startOffsetMs: 0, durationMs: 100 }),
        span({
          spanId: 'child',
          name: 'data.query.sqlite',
          startOffsetMs: 10,
          durationMs: 30,
          parentSpanId: 'root'
        })
      ]
    })
    const html = renderToStaticMarkup(<FlameChart trace={trace} />)
    expect(html).toContain('data-testid="trace-flamechart"')
    expect(count(html, 'data-testid="flame-span"')).toBe(2)
    expect(html).toContain('data-depth="0"')
    expect(html).toContain('data-depth="1"')
    // self time of the parent (100 - 30 = 70) is surfaced in the tooltip.
    expect(html).toContain('70.0ms self')
  })

  it('degrades to a label when a trace has no spans', () => {
    const html = renderToStaticMarkup(<FlameChart trace={makeTrace({ spans: [], totalMs: 12 })} />)
    expect(count(html, 'data-testid="flame-span"')).toBe(0)
    expect(html).toContain('no spans captured')
  })
})
