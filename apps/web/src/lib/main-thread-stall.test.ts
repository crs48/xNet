import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import {
  __resetMainThreadStallDetector,
  MAIN_THREAD_BLOCK_STORAGE_KEY,
  startMainThreadStallDetector
} from './main-thread-stall'

afterEach(() => {
  __resetBootTimeline()
  __resetMainThreadStallDetector()
  localStorage.removeItem(MAIN_THREAD_BLOCK_STORAGE_KEY)
  localStorage.removeItem('xnet:boot:debug')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('main-thread stall detector (0253)', () => {
  it('records the worst event-loop freeze, its offset, and the phase it hit', () => {
    vi.useFakeTimers()
    let fakeNow = 0
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNow)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    localStorage.setItem('xnet:boot:debug', 'true')
    // Boot reaches hub:connected fast (0.6s in the field), THEN the thread freezes.
    bootMark('init:start') // base = 0
    bootMark('hub:connected')
    startMainThreadStallDetector()

    // A normal heartbeat tick — no block; phase as of this tick is hub:connected.
    fakeNow = 200
    vi.advanceTimersByTime(200)
    expect(localStorage.getItem(MAIN_THREAD_BLOCK_STORAGE_KEY)).toBeNull()

    // The main thread freezes for ~18s: the next tick fires only once the clock
    // has jumped, and the gap between ticks IS the freeze.
    fakeNow = 18_200
    vi.advanceTimersByTime(200)

    const block = JSON.parse(localStorage.getItem(MAIN_THREAD_BLOCK_STORAGE_KEY) as string)
    expect(block.blockMs).toBeGreaterThan(15_000)
    expect(block.atOffsetMs).toBe(200) // last good tick before the freeze
    expect(block.phaseBefore).toBe('hub:connected') // names the post-connect window
  })

  it('keeps the WORST block when several occur', () => {
    vi.useFakeTimers()
    let fakeNow = 0
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNow)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    localStorage.setItem('xnet:boot:debug', 'true')
    bootMark('init:start')
    startMainThreadStallDetector()

    fakeNow = 3_200 // a ~3s block
    vi.advanceTimersByTime(200)
    fakeNow = 3_400
    vi.advanceTimersByTime(200)
    fakeNow = 21_400 // an ~18s block — must win
    vi.advanceTimersByTime(200)

    const block = JSON.parse(localStorage.getItem(MAIN_THREAD_BLOCK_STORAGE_KEY) as string)
    expect(block.blockMs).toBeGreaterThan(15_000)
  })
})
