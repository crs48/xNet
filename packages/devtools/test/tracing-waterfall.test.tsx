/**
 * Tests for the trace Waterfall component and tracing instrumentation
 * (exploration 0190). Uses react-dom/server (the devtools package has no
 * @testing-library/react) since the Waterfall is a pure, event-free SVG.
 */
import type { DevToolsTrace } from '../src/core/types'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { DevToolsEventBus } from '../src/core/event-bus'
import { instrumentTracing } from '../src/instrumentation/tracing'
import { Waterfall } from '../src/panels/TracesPanel/Waterfall'

function makeTrace(overrides: Partial<DevToolsTrace> = {}): DevToolsTrace {
  return {
    traceId: 't1',
    rootKind: 'query',
    rootName: 'query:Task.list',
    startedAt: 0,
    totalMs: 41,
    spans: [
      {
        spanId: 's1',
        name: 'data.query.sqlite',
        startOffsetMs: 7,
        durationMs: 18,
        attributes: { returnedRows: 6, fullTableScan: true }
      },
      { spanId: 's2', name: 'data.query.commit', startOffsetMs: 38, durationMs: 1 }
    ],
    ...overrides
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('Waterfall', () => {
  it('renders one bar group per span', () => {
    const html = renderToStaticMarkup(<Waterfall trace={makeTrace()} />)
    expect(countOccurrences(html, 'data-testid="trace-span"')).toBe(2)
  })

  it('marks a full table scan span', () => {
    const html = renderToStaticMarkup(<Waterfall trace={makeTrace()} />)
    expect(html).toContain('⚠')
  })

  it('degrades to a label when a trace has no spans', () => {
    const html = renderToStaticMarkup(<Waterfall trace={makeTrace({ spans: [], totalMs: 300 })} />)
    expect(countOccurrences(html, 'data-testid="trace-span"')).toBe(0)
    expect(html).toContain('no spans captured')
  })
})

describe('instrumentTracing', () => {
  it('emits each new trace to the bus exactly once', () => {
    const bus = new DevToolsEventBus()
    const emitted: string[] = []
    bus.on('tracing:trace', (e) => emitted.push(e.trace.traceId))

    // Fake collector with a controllable ring.
    let listener: ((traces: readonly DevToolsTrace[]) => void) | null = null
    const collector = {
      subscribe(l: (traces: readonly DevToolsTrace[]) => void) {
        listener = l
        return () => {
          listener = null
        }
      }
    }
    const stop = instrumentTracing(collector, bus)

    const a = makeTrace({ traceId: 'a' })
    const b = makeTrace({ traceId: 'b' })
    listener!([a])
    listener!([a, b]) // ring grew; only 'b' is new
    expect(emitted).toEqual(['a', 'b'])

    stop()
    expect(listener).toBeNull()
  })

  it('returns an unsubscribe that detaches from the collector', () => {
    const unsub = vi.fn()
    const collector = { subscribe: () => unsub }
    const stop = instrumentTracing(collector, new DevToolsEventBus())
    stop()
    expect(unsub).toHaveBeenCalledOnce()
  })
})
