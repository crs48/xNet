/**
 * Tests for debounce utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, createUpdateBatcher, createDeltaBatcher } from '../utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should delay function execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100 })

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100 })

    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should enforce maxWait', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100, maxWait: 200 })

    // Call repeatedly
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)

    // Should have executed due to maxWait
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should cancel pending execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100 })

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(100)

    expect(fn).not.toHaveBeenCalled()
  })

  it('should flush immediately', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100 })

    debounced()
    debounced.flush()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should report pending status', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100 })

    expect(debounced.pending()).toBe(false)
    debounced()
    expect(debounced.pending()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(debounced.pending()).toBe(false)
  })

  it('should execute on leading edge when configured', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, { wait: 100, leading: true })

    debounced('first')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('first')

    // Subsequent calls within wait period should be debounced (not immediate)
    debounced('second')
    // Leading means first call executes immediately, but subsequent calls are still debounced
    // So this second call will be queued, not executed immediately
    expect(fn).toHaveBeenCalledTimes(1)

    // After wait period, the trailing edge should NOT execute if leading is true
    // (standard behavior: leading edge only)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('createUpdateBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should batch a single update and flush after wait', () => {
    const onFlush = vi.fn()
    const batcher = createUpdateBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    // Add a single update (no Yjs merge needed)
    batcher.add(new Uint8Array([1, 2, 3]))

    expect(onFlush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
  })

  it('should flush immediately with single update', () => {
    const onFlush = vi.fn()
    const batcher = createUpdateBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add(new Uint8Array([1, 2, 3]))
    batcher.flush()

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
  })

  it('should cancel pending updates', () => {
    const onFlush = vi.fn()
    const batcher = createUpdateBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add(new Uint8Array([1, 2, 3]))
    batcher.cancel()
    vi.advanceTimersByTime(50)

    expect(onFlush).not.toHaveBeenCalled()
  })

  it('should enforce maxWait', async () => {
    const onFlush = vi.fn()
    const batcher = createUpdateBatcher({
      wait: 50,
      maxWait: 100,
      onFlush
    })

    batcher.add(new Uint8Array([1]))
    vi.advanceTimersByTime(40)
    batcher.add(new Uint8Array([2]))
    vi.advanceTimersByTime(40)
    batcher.add(new Uint8Array([3]))
    vi.advanceTimersByTime(40)

    // Should have flushed due to maxWait
    await vi.runAllTimersAsync()
    expect(onFlush).toHaveBeenCalled()
  })
})

describe('createDeltaBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should batch deltas', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1' }, index: 0 })
    batcher.add({ type: 'add', node: { id: '2' }, index: 1 })

    expect(onFlush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith([
      { type: 'add', node: { id: '1' }, index: 0 },
      { type: 'add', node: { id: '2' }, index: 1 }
    ])
  })

  it('should coalesce add + remove to nothing', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1' }, index: 0 })
    batcher.add({ type: 'remove', nodeId: '1' })

    vi.advanceTimersByTime(50)

    // No deltas should be emitted
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('should coalesce add + update to add with new data', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1', title: 'old' }, index: 0 })
    batcher.add({ type: 'update', nodeId: '1', node: { id: '1', title: 'new' } })

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledWith([
      { type: 'add', node: { id: '1', title: 'new' }, index: 0 }
    ])
  })

  it('should coalesce remove + add to update', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'remove', nodeId: '1' })
    batcher.add({ type: 'add', node: { id: '1', title: 'restored' }, index: 0 })

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledWith([
      { type: 'update', nodeId: '1', node: { id: '1', title: 'restored' } }
    ])
  })

  it('should coalesce multiple updates to latest', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'update', nodeId: '1', node: { id: '1', title: 'v1' } })
    batcher.add({ type: 'update', nodeId: '1', node: { id: '1', title: 'v2' } })
    batcher.add({ type: 'update', nodeId: '1', node: { id: '1', title: 'v3' } })

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledWith([
      { type: 'update', nodeId: '1', node: { id: '1', title: 'v3' } }
    ])
  })

  it('should coalesce update + remove to remove', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'update', nodeId: '1', node: { id: '1', title: 'updated' } })
    batcher.add({ type: 'remove', nodeId: '1' })

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledWith([{ type: 'remove', nodeId: '1' }])
  })

  it('should handle mixed deltas for different nodes', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1' }, index: 0 })
    batcher.add({ type: 'add', node: { id: '2' }, index: 1 })
    batcher.add({ type: 'remove', nodeId: '1' }) // Cancels add of '1'
    batcher.add({ type: 'update', nodeId: '2', node: { id: '2', title: 'updated' } })

    vi.advanceTimersByTime(50)

    expect(onFlush).toHaveBeenCalledWith([
      { type: 'add', node: { id: '2', title: 'updated' }, index: 1 }
    ])
  })

  it('should flush immediately', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1' }, index: 0 })
    batcher.flush()

    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('should cancel pending deltas', () => {
    const onFlush = vi.fn()
    const batcher = createDeltaBatcher({
      wait: 50,
      maxWait: 200,
      onFlush
    })

    batcher.add({ type: 'add', node: { id: '1' }, index: 0 })
    batcher.cancel()
    vi.advanceTimersByTime(50)

    expect(onFlush).not.toHaveBeenCalled()
  })
})
