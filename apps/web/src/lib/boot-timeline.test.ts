import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetBootTimeline,
  bootMark,
  bootMarkAt,
  bootMeasure,
  getBootTimeline,
  logBootTimeline,
  observeDocWarmMark,
  observeSyncFirstMark
} from './boot-timeline'

afterEach(() => {
  __resetBootTimeline()
})

describe('boot-timeline', () => {
  it('records a timestamp for a marked phase', () => {
    expect(bootMarkAt('init:start')).toBeUndefined()
    bootMark('init:start')
    expect(bootMarkAt('init:start')).toBeTypeOf('number')
  })

  it('first write wins — a later mark does not overwrite the first', () => {
    bootMark('hub:connected')
    const first = bootMarkAt('hub:connected')
    bootMark('hub:connected') // simulates a reconnect
    expect(bootMarkAt('hub:connected')).toBe(first)
  })

  it('override:true re-measures when intended', () => {
    bootMark('hub:connected')
    const first = bootMarkAt('hub:connected') as number
    bootMark('hub:connected', { override: true })
    const second = bootMarkAt('hub:connected') as number
    expect(second).toBeGreaterThanOrEqual(first)
  })

  it('bootMeasure returns a non-negative duration between two phases', () => {
    bootMark('init:start')
    bootMark('sqlite:open')
    const ms = bootMeasure('init:start', 'sqlite:open')
    expect(ms).toBeTypeOf('number')
    expect(ms as number).toBeGreaterThanOrEqual(0)
  })

  it('bootMeasure returns undefined when a phase is missing', () => {
    bootMark('init:start')
    expect(bootMeasure('init:start', 'hub:connected')).toBeUndefined()
    expect(bootMeasure('store:ready', 'hub:connected')).toBeUndefined()
  })

  it('getBootTimeline omits segments whose phases are not yet marked', () => {
    bootMark('init:start')
    bootMark('sqlite:open')
    const timeline = getBootTimeline()
    expect(timeline.wasm).toBeTypeOf('number')
    expect(timeline.connect).toBeUndefined()
    expect(timeline.firstPaint).toBeUndefined()
  })
})

type ObserverCb = (list: { getEntries: () => Array<{ name: string }> }) => void

// Cast once through a typed view so the per-test assignments don't start with
// `(` (which forces the ASI-safety leading `;` that eslint then rejects).
const glob = globalThis as unknown as {
  PerformanceObserver?: unknown
  performance: { getEntriesByName?: unknown }
}

describe('observeSyncFirstMark (0212)', () => {
  // Save/restore the globals the function probes so tests don't leak into the
  // rest of the file (jsdom may or may not provide either of these).
  const realPO = glob.PerformanceObserver
  const realGetEntries = glob.performance?.getEntriesByName

  afterEach(() => {
    glob.PerformanceObserver = realPO
    if (glob.performance) glob.performance.getEntriesByName = realGetEntries
  })

  it('marks sync:first immediately when the mark already fired (buffer hit)', () => {
    glob.performance.getEntriesByName = () => [{ name: 'xnet:sync:first-remote-apply' }]
    let observed = false
    glob.PerformanceObserver = class {
      observe() {
        observed = true
      }
      disconnect() {}
    }
    observeSyncFirstMark()
    expect(bootMarkAt('sync:first')).toBeTypeOf('number')
    expect(observed).toBe(false) // returned before creating a live observer
  })

  it('marks sync:first when the live observer sees the mark, then disconnects', () => {
    glob.performance.getEntriesByName = () => []
    let captured: ObserverCb | null = null
    let observed = false
    let disconnected = false
    glob.PerformanceObserver = class {
      constructor(cb: ObserverCb) {
        captured = cb
      }
      observe() {
        observed = true
      }
      disconnect() {
        disconnected = true
      }
    }
    observeSyncFirstMark()
    expect(observed).toBe(true)
    expect(bootMarkAt('sync:first')).toBeUndefined()

    // The runtime emits the mark on the first remote apply.
    const fire = captured as ObserverCb | null
    fire?.({
      getEntries: () => [{ name: 'unrelated' }, { name: 'xnet:sync:first-remote-apply' }]
    })
    expect(bootMarkAt('sync:first')).toBeTypeOf('number')
    expect(disconnected).toBe(true)
  })

  it('is a no-op when PerformanceObserver is unavailable', () => {
    glob.PerformanceObserver = undefined
    observeSyncFirstMark()
    expect(bootMarkAt('sync:first')).toBeUndefined()
  })
})

describe('observeDocWarmMark (0227)', () => {
  const realPO = glob.PerformanceObserver
  const realGetEntries = glob.performance?.getEntriesByName

  afterEach(() => {
    glob.PerformanceObserver = realPO
    if (glob.performance) glob.performance.getEntriesByName = realGetEntries
  })

  it('marks docwarm:ready and surfaces a docwarm segment when the mark fires', () => {
    glob.performance.getEntriesByName = () => []
    let captured: ObserverCb | null = null
    glob.PerformanceObserver = class {
      constructor(cb: ObserverCb) {
        captured = cb
      }
      observe() {}
      disconnect() {}
    }
    bootMark('store:ready')
    observeDocWarmMark()
    expect(bootMarkAt('docwarm:ready')).toBeUndefined()

    const fire = captured as ObserverCb | null
    fire?.({ getEntries: () => [{ name: 'xnet:docpool:first-acquire' }] })
    expect(bootMarkAt('docwarm:ready')).toBeTypeOf('number')
    expect(getBootTimeline().docwarm).toBeTypeOf('number')
  })

  it('marks docwarm:ready immediately on a buffer hit', () => {
    glob.performance.getEntriesByName = () => [{ name: 'xnet:docpool:first-acquire' }]
    glob.PerformanceObserver = class {
      observe() {}
      disconnect() {}
    }
    observeDocWarmMark()
    expect(bootMarkAt('docwarm:ready')).toBeTypeOf('number')
  })
})

describe('logBootTimeline (0204)', () => {
  it('logs the timeline once when debug is enabled, then latches', () => {
    localStorage.setItem('xnet:boot:debug', 'true')
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      bootMark('init:start')
      bootMark('sqlite:open')
      logBootTimeline('hub:connected')
      logBootTimeline('hub:connected') // one-shot latch: must not log twice
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0]?.[0])).toContain('boot timeline')
    } finally {
      spy.mockRestore()
      localStorage.removeItem('xnet:boot:debug')
    }
  })

  it('logs once per distinct reason so first-paint is captured too (0229)', () => {
    localStorage.setItem('xnet:boot:debug', 'true')
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      bootMark('init:start')
      logBootTimeline('hub:connected')
      logBootTimeline('hub:connected') // same reason: latched
      logBootTimeline('query:first-rows') // different reason: logs again
      logBootTimeline('query:first-rows') // latched
      expect(spy).toHaveBeenCalledTimes(2)
      expect(String(spy.mock.calls[1]?.[0])).toContain('query:first-rows')
    } finally {
      spy.mockRestore()
      localStorage.removeItem('xnet:boot:debug')
    }
  })
})
