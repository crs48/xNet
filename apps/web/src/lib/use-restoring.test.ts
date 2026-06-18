import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetColdStartProbe, recordColdStartProbe } from './store-cold-start'
import { useRestoringFromHub } from './use-restoring'

const state = vi.hoisted(() => ({ hubStatus: 'disconnected' as string }))

vi.mock('@xnetjs/react', () => ({
  useHubStatus: () => state.hubStatus
}))

afterEach(() => {
  __resetColdStartProbe()
  state.hubStatus = 'disconnected'
})

describe('useRestoringFromHub', () => {
  it('is false when no boot probe was recorded', () => {
    const { result } = renderHook(() => useRestoringFromHub())
    expect(result.current).toBe(false)
  })

  it('is true when the cache looks evicted, a hub exists, and it is not yet connected', () => {
    recordColdStartProbe({ empty: true, persisted: false, hubConfigured: true })
    state.hubStatus = 'connecting'
    const { result } = renderHook(() => useRestoringFromHub())
    expect(result.current).toBe(true)
  })

  it('flips false once the hub connects', () => {
    recordColdStartProbe({ empty: true, persisted: false, hubConfigured: true })
    state.hubStatus = 'connected'
    const { result } = renderHook(() => useRestoringFromHub())
    expect(result.current).toBe(false)
  })

  it('is false with no hub configured — a genuinely new/empty workspace', () => {
    recordColdStartProbe({ empty: true, persisted: false, hubConfigured: false })
    state.hubStatus = 'disconnected'
    const { result } = renderHook(() => useRestoringFromHub())
    expect(result.current).toBe(false)
  })

  it('is false for a persisted empty store (not an eviction)', () => {
    recordColdStartProbe({ empty: true, persisted: true, hubConfigured: true })
    state.hubStatus = 'connecting'
    const { result } = renderHook(() => useRestoringFromHub())
    expect(result.current).toBe(false)
  })
})
