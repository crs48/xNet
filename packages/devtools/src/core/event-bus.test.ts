import { describe, it, expect, vi } from 'vitest'
import { DevToolsEventBus } from './event-bus'

describe('DevToolsEventBus', () => {
  it('emits and stores events', () => {
    const bus = new DevToolsEventBus({ maxEvents: 100 })

    bus.emit({
      type: 'store:create',
      nodeId: 'n1',
      schemaId: 's1',
      properties: {},
      lamport: { time: 1, author: 'did:key:test' },
      duration: 0
    })

    expect(bus.size).toBe(1)
    const events = bus.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('store:create')
    expect(events[0].id).toBe('0')
    expect(events[0].timestamp).toBeGreaterThan(0)
    expect(events[0].wallTime).toBeGreaterThan(0)
  })

  it('ring buffer wraps at capacity', () => {
    const bus = new DevToolsEventBus({ maxEvents: 3 })

    bus.emit({
      type: 'store:create',
      nodeId: 'n1',
      schemaId: 's1',
      properties: {},
      lamport: { time: 1, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({
      type: 'store:create',
      nodeId: 'n2',
      schemaId: 's1',
      properties: {},
      lamport: { time: 2, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({
      type: 'store:create',
      nodeId: 'n3',
      schemaId: 's1',
      properties: {},
      lamport: { time: 3, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({
      type: 'store:create',
      nodeId: 'n4',
      schemaId: 's1',
      properties: {},
      lamport: { time: 4, author: 'did:key:z6MkTest' },
      duration: 0
    })

    expect(bus.size).toBe(3)
    expect(bus.capacity).toBe(3)

    const events = bus.getEvents()
    expect(events).toHaveLength(3)
    // Oldest event (n1) was evicted, should start from n2
    expect((events[0] as any).nodeId).toBe('n2')
    expect((events[1] as any).nodeId).toBe('n3')
    expect((events[2] as any).nodeId).toBe('n4')
  })

  it('notifies global subscribers', () => {
    const bus = new DevToolsEventBus()
    const listener = vi.fn()

    bus.subscribe(listener)
    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].type).toBe('store:delete')
  })

  it('notifies typed subscribers', () => {
    const bus = new DevToolsEventBus()
    const listener = vi.fn()

    bus.on('sync:error', listener)
    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })
    bus.emit({ type: 'sync:error', error: 'test', room: 'room1' })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0].type).toBe('sync:error')
  })

  it('unsubscribes correctly', () => {
    const bus = new DevToolsEventBus()
    const listener = vi.fn()

    const unsub = bus.subscribe(listener)
    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })
    expect(listener).toHaveBeenCalledOnce()

    unsub()
    bus.emit({ type: 'store:delete', nodeId: 'n2', duration: 0 })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('pauses and resumes', () => {
    const bus = new DevToolsEventBus()

    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })
    expect(bus.size).toBe(1)

    bus.pause()
    bus.emit({ type: 'store:delete', nodeId: 'n2', duration: 0 })
    expect(bus.size).toBe(1) // Not added while paused
    expect(bus.isPaused).toBe(true)

    bus.resume()
    bus.emit({ type: 'store:delete', nodeId: 'n3', duration: 0 })
    expect(bus.size).toBe(2)
    expect(bus.isPaused).toBe(false)
  })

  it('clears the buffer', () => {
    const bus = new DevToolsEventBus()

    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })
    bus.emit({ type: 'store:delete', nodeId: 'n2', duration: 0 })
    expect(bus.size).toBe(2)

    bus.clear()
    expect(bus.size).toBe(0)
    expect(bus.getEvents()).toHaveLength(0)
  })

  it('filters by type', () => {
    const bus = new DevToolsEventBus()

    bus.emit({
      type: 'store:create',
      nodeId: 'n1',
      schemaId: 's1',
      properties: {},
      lamport: { time: 1, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({ type: 'store:delete', nodeId: 'n2', duration: 0 })
    bus.emit({ type: 'sync:error', error: 'oops', room: 'r1' })

    const creates = bus.getEventsByType('store:create')
    expect(creates).toHaveLength(1)
    expect(creates[0].nodeId).toBe('n1')

    const syncs = bus.getEventsByType('sync:error')
    expect(syncs).toHaveLength(1)
    expect(syncs[0].error).toBe('oops')
  })

  it('filters by node ID', () => {
    const bus = new DevToolsEventBus()

    bus.emit({
      type: 'store:create',
      nodeId: 'abc',
      schemaId: 's1',
      properties: {},
      lamport: { time: 1, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({
      type: 'store:update',
      nodeId: 'xyz',
      properties: { x: 1 },
      lamport: { time: 2, author: 'did:key:z6MkTest' },
      duration: 0
    })
    bus.emit({
      type: 'store:update',
      nodeId: 'abc',
      properties: { y: 2 },
      lamport: { time: 3, author: 'did:key:z6MkTest' },
      duration: 0
    })

    const abcEvents = bus.getEventsForNode('abc')
    expect(abcEvents).toHaveLength(2)
  })

  it('getRecent returns last N events', () => {
    const bus = new DevToolsEventBus()

    for (let i = 0; i < 10; i++) {
      bus.emit({ type: 'store:delete', nodeId: `n${i}`, duration: 0 })
    }

    const recent = bus.getRecent(3)
    expect(recent).toHaveLength(3)
    expect((recent[0] as any).nodeId).toBe('n7')
    expect((recent[2] as any).nodeId).toBe('n9')
  })

  it('handles listener errors gracefully', () => {
    const bus = new DevToolsEventBus()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const badListener = () => {
      throw new Error('boom')
    }
    const goodListener = vi.fn()

    bus.subscribe(badListener)
    bus.subscribe(goodListener)

    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })

    expect(goodListener).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('starts paused when option is set', () => {
    const bus = new DevToolsEventBus({ paused: true })
    expect(bus.isPaused).toBe(true)

    bus.emit({ type: 'store:delete', nodeId: 'n1', duration: 0 })
    expect(bus.size).toBe(0)
  })
})
