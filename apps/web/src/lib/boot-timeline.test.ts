import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetBootTimeline,
  bootMark,
  bootMarkAt,
  bootMeasure,
  getBootTimeline
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
