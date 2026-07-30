import { describe, expect, it, vi } from 'vitest'
import { EntangleBus } from './useEntangle'

describe('EntangleBus', () => {
  it('tracks hover per node and notifies subscribers once per change', () => {
    const bus = new EntangleBus()
    const listener = vi.fn()
    bus.subscribe(listener)

    bus.setHovered('a', true)
    expect(bus.isHovered('a')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    // Redundant set is a no-op — no notification storm on mousemove.
    bus.setHovered('a', true)
    expect(listener).toHaveBeenCalledTimes(1)

    bus.setHovered('a', false)
    expect(bus.isHovered('a')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('selection replaces the previous set', () => {
    const bus = new EntangleBus()
    bus.setSelected(['a', 'b'])
    expect(bus.isSelected('a')).toBe(true)
    bus.setSelected(['c'])
    expect(bus.isSelected('a')).toBe(false)
    expect(bus.isSelected('c')).toBe(true)
  })

  it('snapshotHighlighted unions hovered and selected', () => {
    const bus = new EntangleBus()
    bus.setHovered('a', true)
    bus.setSelected(['a', 'b'])
    expect(bus.snapshotHighlighted().sort()).toEqual(['a', 'b'])
  })

  it('unsubscribe stops notifications', () => {
    const bus = new EntangleBus()
    const listener = vi.fn()
    const unsubscribe = bus.subscribe(listener)
    unsubscribe()
    bus.setHovered('a', true)
    expect(listener).not.toHaveBeenCalled()
  })
})
