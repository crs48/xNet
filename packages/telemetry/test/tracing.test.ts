import { describe, it, expect, vi } from 'vitest'
import {
  TraceCollector,
  emitTraceAsBuckets,
  hashToUnit,
  fnv1a,
  QUERY_STAGES,
  type Trace
} from '../src/tracing'

/** A controllable clock so durations are deterministic. */
function fakeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    }
  }
}

describe('hashToUnit', () => {
  it('is deterministic and within [0, 1)', () => {
    const a = hashToUnit('t1')
    const b = hashToUnit('t1')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })

  it('spreads across the interval', () => {
    const vals = Array.from({ length: 200 }, (_, i) => hashToUnit(`t${i}`))
    const below = vals.filter((v) => v < 0.5).length
    // Should be roughly balanced — allow generous slack.
    expect(below).toBeGreaterThan(60)
    expect(below).toBeLessThan(140)
  })

  it('fnv1a returns an unsigned 32-bit integer', () => {
    const h = fnv1a('hello')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('TraceCollector', () => {
  it('records spans with measured durations and offsets', () => {
    const clock = fakeClock()
    const tc = new TraceCollector({ now: clock.now })
    const trace = tc.startTrace('query', 'query:Task.list', 'fixed')

    const endDescriptor = trace.mark(QUERY_STAGES.descriptorBuild)
    clock.advance(2)
    endDescriptor()

    clock.advance(3) // idle gap
    const endSqlite = trace.mark(QUERY_STAGES.sqliteExec)
    clock.advance(18)
    endSqlite({ candidateRows: 10, returnedRows: 6, fullTableScan: false })

    const result = trace.end()
    expect(result).not.toBeNull()
    expect(result!.spans).toHaveLength(2)
    const [desc, sql] = result!.spans
    expect(desc.name).toBe(QUERY_STAGES.descriptorBuild)
    expect(desc.startOffsetMs).toBe(0)
    expect(desc.durationMs).toBe(2)
    expect(sql.startOffsetMs).toBe(5)
    expect(sql.durationMs).toBe(18)
    expect(sql.attributes?.returnedRows).toBe(6)
    expect(result!.totalMs).toBe(23)
  })

  it('keeps a slow trace even when head sampling is 0', () => {
    const clock = fakeClock()
    const tc = new TraceCollector({ sampleRate: 0, slowMs: 50, now: clock.now })
    const trace = tc.startTrace('query', 'slow')
    clock.advance(120)
    const result = trace.end()
    expect(result).not.toBeNull()
    expect(result!.sampled).toBe(true)
    expect(tc.recent()).toHaveLength(1)
  })

  it('drops a fast non-sampled trace', () => {
    const clock = fakeClock()
    const tc = new TraceCollector({ sampleRate: 0, slowMs: 50, now: clock.now })
    const trace = tc.startTrace('query', 'fast')
    clock.advance(5)
    expect(trace.end()).toBeNull()
    expect(tc.recent()).toHaveLength(0)
  })

  it('is a no-op when disabled (inert handle)', () => {
    const tc = new TraceCollector({ enabled: () => false })
    const trace = tc.startTrace('query', 'q')
    expect(trace.active).toBe(false)
    const end = trace.mark('x')
    expect(end()).toBe('') // inert span id
    expect(trace.end()).toBeNull()
    expect(tc.recent()).toHaveLength(0)
  })

  it('does not capture spans for a non-head-sampled trace before the slow check', () => {
    const clock = fakeClock()
    const tc = new TraceCollector({ sampleRate: 0, slowMs: 10, now: clock.now })
    const trace = tc.startTrace('query', 'q')
    expect(trace.active).toBe(false)
    trace.mark('a')() // recorded into nothing
    clock.advance(20) // becomes slow
    const result = trace.end()
    expect(result).not.toBeNull()
    expect(result!.spans).toHaveLength(0) // inert during the run, kept only as a total
  })

  it('attaches out-of-band spans by id (worker spans)', () => {
    const clock = fakeClock()
    const tc = new TraceCollector({ now: clock.now })
    const trace = tc.startTrace('query', 'q', 'wid')
    tc.addSpansById('wid', [
      {
        name: QUERY_STAGES.sqliteExec,
        startOffsetMs: 4,
        durationMs: 12,
        attributes: { thread: 'worker', returnedRows: 6 }
      }
    ])
    const result = trace.end()
    expect(result!.spans.some((s) => s.attributes?.thread === 'worker')).toBe(true)
  })

  it('respects ring capacity', () => {
    const tc = new TraceCollector({ capacity: 3 })
    for (let i = 0; i < 5; i++) tc.startTrace('query', `q${i}`).end()
    expect(tc.recent()).toHaveLength(3)
  })

  it('notifies subscribers and fires onComplete for kept traces', () => {
    const onComplete = vi.fn()
    const tc = new TraceCollector({ onComplete })
    const seen: number[] = []
    const unsub = tc.subscribe((traces) => seen.push(traces.length))
    tc.startTrace('mutate', 'm').end()
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(seen.at(-1)).toBe(1)
    unsub()
    tc.startTrace('mutate', 'm2').end()
    expect(seen.at(-1)).toBe(1) // no further notifications after unsubscribe
  })
})

describe('emitTraceAsBuckets', () => {
  function makeTrace(): Trace {
    return {
      traceId: 'tid',
      rootKind: 'query',
      rootName: 'query:Task.list',
      startedAt: 0,
      totalMs: 41.3,
      ended: true,
      sampled: true,
      spans: [
        {
          spanId: 's1',
          name: QUERY_STAGES.sqliteExec,
          startOffsetMs: 7,
          durationMs: 18,
          attributes: { returnedRows: 6 }
        },
        { spanId: 's2', name: QUERY_STAGES.flatten, startOffsetMs: 38, durationMs: 1 }
      ]
    }
  }

  it('emits one performance metric per span plus a total, and row-count usage', () => {
    const reporter = {
      reportPerformance: vi.fn(),
      reportUsage: vi.fn()
    }
    emitTraceAsBuckets(makeTrace(), reporter)

    expect(reporter.reportPerformance).toHaveBeenCalledWith('query.total', 41.3, 'tracing')
    expect(reporter.reportPerformance).toHaveBeenCalledWith(QUERY_STAGES.sqliteExec, 18, 'tracing')
    expect(reporter.reportPerformance).toHaveBeenCalledWith(QUERY_STAGES.flatten, 1, 'tracing')
    expect(reporter.reportUsage).toHaveBeenCalledWith(`${QUERY_STAGES.sqliteExec}.rows`, 6)
    // flatten span has no returnedRows → no usage metric for it
    expect(reporter.reportUsage).toHaveBeenCalledTimes(1)
  })

  it('passes only bucketable scalars — never the rootName/attributes blob', () => {
    const calls: unknown[][] = []
    const reporter = {
      reportPerformance: (...a: unknown[]) => calls.push(a),
      reportUsage: () => {}
    }
    emitTraceAsBuckets(makeTrace(), reporter)
    // Every emitted metric name is a static constant, never the user-facing rootName.
    for (const [name] of calls) {
      expect(String(name)).not.toContain('Task.list')
    }
  })
})
