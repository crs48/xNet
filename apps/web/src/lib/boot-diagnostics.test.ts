import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetBootDiagnostics,
  onBootFailure,
  reportBootFailure,
  type BootFailure
} from './boot-diagnostics'
import { __resetBootTimeline, bootMark, lastBootPhase } from './boot-timeline'

afterEach(() => {
  __resetBootDiagnostics()
  __resetBootTimeline()
  delete window.__xnetBootError
  vi.restoreAllMocks()
})

describe('reportBootFailure', () => {
  it('stamps window.__xnetBootError with the furthest boot phase reached', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bootMark('init:start')
    bootMark('sqlite:open')

    const failure = reportBootFailure('init', new Error('OPFS denied'))

    expect(failure.stage).toBe('sqlite:open')
    expect(failure.message).toBe('OPFS denied')
    expect(failure.kind).toBe('init')
    expect(window.__xnetBootError).toEqual(failure)
  })

  it('falls back to pre-react when no boot phase has been marked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = reportBootFailure('window.onerror', 'boom')
    expect(failure.stage).toBe('pre-react')
    expect(failure.message).toBe('boom')
  })

  it('accepts render failures from the top-level ErrorBoundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: BootFailure[] = []
    onBootFailure((f) => seen.push(f))

    const failure = reportBootFailure('render', new Error('boom in a component'))

    expect(failure.kind).toBe('render')
    expect(seen).toHaveLength(1)
    expect(window.__xnetBootError?.kind).toBe('render')
  })

  it('reports the canonically-furthest phase even when marks land out of order', () => {
    // Warm local-first path: the local query paints before the hub connects, so
    // query:first-rows is *inserted* before hub:connected — but hub:connected is
    // the canonically-later phase.
    bootMark('init:start')
    bootMark('store:ready')
    bootMark('query:first-rows')
    bootMark('hub:connected')
    expect(lastBootPhase()).toBe('query:first-rows')
  })
})

describe('onBootFailure', () => {
  it('flushes failures queued before the sink registered', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reportBootFailure('timeout', new Error('stuck'))

    const seen: BootFailure[] = []
    onBootFailure((f) => seen.push(f))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.kind).toBe('timeout')
  })

  it('delivers subsequent failures live once registered', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: BootFailure[] = []
    onBootFailure((f) => seen.push(f))

    reportBootFailure('unhandledrejection', new Error('later'))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.message).toBe('later')
  })

  it('does not let a throwing sink break reporting', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    onBootFailure(() => {
      throw new Error('bad sink')
    })
    expect(() => reportBootFailure('init', new Error('x'))).not.toThrow()
  })
})
