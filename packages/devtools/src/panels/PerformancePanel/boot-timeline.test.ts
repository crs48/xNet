import { describe, expect, it } from 'vitest'
import { computeBootSegments, firstPaintMs } from './boot-timeline'

describe('computeBootSegments', () => {
  it('derives consecutive segment durations from marks', () => {
    const segments = computeBootSegments({
      'init:start': 0,
      'sqlite:open': 10,
      'sqlite:schema': 25,
      'identity:ready': 40,
      'store:ready': 80,
      'hub:connected': 200,
      'sync:first': 260
    })
    const map = Object.fromEntries(segments.map((s) => [s.label, s.ms]))
    expect(map['WASM init']).toBe(10)
    expect(map.Schema).toBe(15)
    expect(map.Connect).toBe(120)
    expect(map['First sync']).toBe(60)
  })

  it('omits segments with missing endpoints', () => {
    const segments = computeBootSegments({ 'init:start': 0, 'sqlite:open': 10 })
    expect(segments.map((s) => s.label)).toEqual(['WASM init'])
  })

  it('never returns negative durations', () => {
    const segments = computeBootSegments({ 'init:start': 100, 'sqlite:open': 50 })
    expect(segments[0].ms).toBe(0)
  })
})

describe('firstPaintMs', () => {
  it('measures init to first rows', () => {
    expect(firstPaintMs({ 'init:start': 0, 'query:first-rows': 320 })).toBe(320)
  })
  it('is undefined when either mark is missing', () => {
    expect(firstPaintMs({ 'init:start': 0 })).toBeUndefined()
  })
})
