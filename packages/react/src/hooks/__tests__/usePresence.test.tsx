/**
 * usePresence — throttle, peer visibility, eviction, and the lane rule
 * (presence must never produce persisted writes). Exploration 0314.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePresence, type PresenceAwareness } from '../usePresence'

type MockAwareness = PresenceAwareness & {
  /** Every setLocalState payload, in order — the full broadcast history. */
  broadcasts: Array<Record<string, unknown> | null>
  /** Simulate a remote peer's state arriving (or leaving with null). */
  setRemote(clientId: number, state: Record<string, unknown> | null): void
}

function createMockAwareness(clientID = 1): MockAwareness {
  const states = new Map<number, Record<string, unknown>>()
  const handlers = new Set<() => void>()
  const emit = () => handlers.forEach((h) => h())
  return {
    clientID,
    broadcasts: [],
    getLocalState() {
      return states.get(clientID) ?? null
    },
    setLocalState(state) {
      this.broadcasts.push(state)
      if (state === null) states.delete(clientID)
      else states.set(clientID, state)
      emit()
    },
    getStates: () => new Map(states),
    setRemote(clientId, state) {
      if (state === null) states.delete(clientId)
      else states.set(clientId, state)
      emit()
    },
    on: (_event, handler) => handlers.add(handler),
    off: (_event, handler) => handlers.delete(handler)
  }
}

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces initial state merged over existing awareness fields', () => {
    const aw = createMockAwareness()
    // Another consumer (useNode) already broadcast a `user` field.
    aw.setLocalState({ user: { name: 'Ada' } })
    aw.broadcasts.length = 0

    renderHook(() => usePresence(aw, { x: 0, y: 0 }))

    expect(aw.broadcasts).toHaveLength(1)
    expect(aw.broadcasts[0]).toEqual({ user: { name: 'Ada' }, x: 0, y: 0 })
  })

  it('coalesces rapid patches into leading + trailing broadcasts', () => {
    const aw = createMockAwareness()
    const { result } = renderHook(() => usePresence(aw, { x: 0 }, { throttleMs: 33 }))
    aw.broadcasts.length = 0

    act(() => {
      // Simulate a 60fps pointermove burst inside one throttle window.
      vi.advanceTimersByTime(40) // move past the announce broadcast
      for (let i = 1; i <= 10; i++) result.current.setState({ x: i })
    })
    expect(aw.broadcasts).toHaveLength(1) // leading edge
    expect(aw.broadcasts[0]).toMatchObject({ x: 1 })

    act(() => {
      vi.advanceTimersByTime(33) // trailing edge fires with the latest value
    })
    expect(aw.broadcasts).toHaveLength(2)
    expect(aw.broadcasts[1]).toMatchObject({ x: 10 })
  })

  it('keeps broadcast rate at or under 1000/throttleMs per second', () => {
    const aw = createMockAwareness()
    const { result } = renderHook(() => usePresence(aw, { x: 0 }, { throttleMs: 33 }))
    aw.broadcasts.length = 0

    act(() => {
      // One second of 120fps updates.
      for (let t = 0; t < 1000; t += 8) {
        result.current.setState({ x: t })
        vi.advanceTimersByTime(8)
      }
      vi.runOnlyPendingTimers()
    })
    // 1000ms / 33ms ≈ 30 windows; leading+trailing overlap keeps it ≤ ~32.
    expect(aw.broadcasts.length).toBeGreaterThan(0)
    expect(aw.broadcasts.length).toBeLessThanOrEqual(32)
  })

  it('exposes remote peers, excludes self, and evicts on disconnect', () => {
    const aw = createMockAwareness(1)
    const { result } = renderHook(() => usePresence(aw, { x: 0 }))

    act(() => {
      aw.setRemote(2, { x: 5, user: { name: 'Grace' } })
      aw.setRemote(3, { x: 9 })
    })
    expect(result.current.peers.map((p) => p.clientId).sort()).toEqual([2, 3])
    expect(result.current.clientId).toBe(1)

    act(() => {
      aw.setRemote(2, null) // peer 2 disconnects (awareness eviction)
    })
    expect(result.current.peers.map((p) => p.clientId)).toEqual([3])
  })

  it('ignores clients that never joined this presence shape', () => {
    const aw = createMockAwareness(1)
    const { result } = renderHook(() => usePresence(aw, { x: 0 }))

    act(() => {
      // An editor client on the same doc broadcasting only cursor state.
      aw.setRemote(7, { cursor: { anchor: 3 } })
    })
    expect(result.current.peers).toEqual([])
  })

  it('retracts only its own fields on unmount', () => {
    const aw = createMockAwareness()
    aw.setLocalState({ user: { name: 'Ada' } })
    const { result, unmount } = renderHook(() =>
      usePresence<{ x: number; y?: number }>(aw, { x: 0 })
    )

    act(() => {
      vi.advanceTimersByTime(40)
      result.current.setState({ y: 1 }) // patched key also becomes owned
      vi.runOnlyPendingTimers()
    })
    unmount()

    // `user` (owned by another consumer) survives; x and y are gone.
    expect(aw.getStates().get(aw.clientID)).toEqual({ user: { name: 'Ada' } })
  })

  it('handles a null awareness (before the node room attaches)', () => {
    const { result } = renderHook(() => usePresence(null, { x: 0 }))
    expect(result.current.peers).toEqual([])
    expect(result.current.clientId).toBeNull()
    // setState before attach must not throw.
    act(() => result.current.setState({ x: 1 }))
  })

  it('never touches anything but awareness (lane rule: no persisted writes)', () => {
    // Constructional guarantee: the hook operates on the Awareness duck type
    // alone. A mock that records every interaction shows the only mutation
    // surface used is setLocalState — there is no store, bridge, or mutation
    // path for it to reach a node_changes row through.
    const aw = createMockAwareness()
    const calls: string[] = []
    const spy = new Proxy(aw, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') calls.push(prop)
        return Reflect.get(target, prop, receiver)
      }
    })
    const { result, unmount } = renderHook(() => usePresence(spy, { x: 0 }))
    act(() => {
      result.current.setState({ x: 2 })
      vi.runOnlyPendingTimers()
    })
    unmount()
    expect(new Set(calls)).toEqual(
      new Set([
        'clientID',
        'getLocalState',
        'setLocalState',
        'getStates',
        'on',
        'off',
        'broadcasts'
      ])
    )
  })
})
