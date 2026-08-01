import { describe, expect, it, vi } from 'vitest'
import { createPermissionBroker } from './permission-broker'

describe('permission broker (exploration 0416)', () => {
  it('parks a request and resolves it when approved', async () => {
    const parked: string[] = []
    const broker = createPermissionBroker({ onPark: (p) => parked.push(p.id) })

    const decision = broker.request('xnet_create_page', { title: 'x' })
    await vi.waitFor(() => expect(parked).toHaveLength(1))

    expect(broker.settle(parked[0], true)).toBe(true)
    await expect(decision).resolves.toBe(true)
    expect(broker.list()).toEqual([])
  })

  it('resolves false when denied', async () => {
    const parked: string[] = []
    const broker = createPermissionBroker({ onPark: (p) => parked.push(p.id) })

    const decision = broker.request('xnet_delete')
    await vi.waitFor(() => expect(parked).toHaveLength(1))
    broker.settle(parked[0], false)

    await expect(decision).resolves.toBe(false)
  })

  it('denies on expiry — silence is never consent', async () => {
    vi.useFakeTimers()
    try {
      const broker = createPermissionBroker({ ttlMs: 1000 })
      const decision = broker.request('xnet_delete')

      vi.advanceTimersByTime(1001)
      await expect(decision).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('denies everything parked when the turn ends', async () => {
    const broker = createPermissionBroker()
    const a = broker.request('tool_a')
    const b = broker.request('tool_b')

    broker.denyAll()

    await expect(a).resolves.toBe(false)
    await expect(b).resolves.toBe(false)
    expect(broker.list()).toEqual([])
  })

  it('never asks when the launch flag forbids writes — the ceiling holds', async () => {
    const onPark = vi.fn()
    const broker = createPermissionBroker({ writesAllowed: false, onPark })

    await expect(broker.request('xnet_create_page')).resolves.toBe(false)
    // The question is never even posed.
    expect(onPark).not.toHaveBeenCalled()
  })

  it('reports unknown and already-settled ids rather than silently succeeding', async () => {
    const parked: string[] = []
    const broker = createPermissionBroker({ onPark: (p) => parked.push(p.id) })
    const decision = broker.request('t')
    await vi.waitFor(() => expect(parked).toHaveLength(1))

    expect(broker.settle('perm-nope', true)).toBe(false)
    expect(broker.settle(parked[0], true)).toBe(true)
    // Settling twice must not report success the second time.
    expect(broker.settle(parked[0], true)).toBe(false)
    await expect(decision).resolves.toBe(true)
  })

  it('lists parked requests so a reconnecting panel sees them', async () => {
    const broker = createPermissionBroker({ clock: () => 1000, ttlMs: 500 })
    void broker.request('xnet_update', { id: 'n1' })

    await vi.waitFor(() => expect(broker.list()).toHaveLength(1))
    expect(broker.list()[0]).toMatchObject({
      tool: 'xnet_update',
      input: { id: 'n1' },
      expiresAt: 1500
    })
  })
})
