/**
 * Tests for NodeStore instrumentation — conflict taxonomy (exploration 0296).
 */

import type { MergeConflict, NodeStore } from '@xnetjs/data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../core/constants'
import { DevToolsEventBus } from '../core/event-bus'
import { instrumentStore } from './store'

function makeConflict(kind: MergeConflict['kind']): MergeConflict {
  const stamp = (lamport: number) => ({
    lamport,
    author: 'did:key:zAuthor',
    wallTime: 1_000 + lamport
  })

  return {
    nodeId: 'task_1',
    key: 'title',
    localValue: 'local',
    localTimestamp: stamp(2),
    remoteValue: 'remote',
    remoteTimestamp: stamp(1),
    resolved: kind === 'conflict' ? 'local' : 'remote',
    kind
  }
}

describe('instrumentStore conflict taxonomy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits true conflicts as store:conflict and housekeeping as store:lww-resolution', () => {
    const bus = new DevToolsEventBus()
    const conflicts = [makeConflict('conflict'), makeConflict('lww-resolution')]
    const store = {
      subscribe: () => () => {},
      getRecentConflicts: () => conflicts.splice(0),
      clearConflicts: () => {}
    } as unknown as NodeStore

    const teardown = instrumentStore(store, bus)
    vi.advanceTimersByTime(DEFAULTS.CONFLICT_POLL_MS)
    teardown()

    expect(bus.getEventsByType('store:conflict')).toEqual([
      expect.objectContaining({ conflict: expect.objectContaining({ kind: 'conflict' }) })
    ])
    expect(bus.getEventsByType('store:lww-resolution')).toEqual([
      expect.objectContaining({ conflict: expect.objectContaining({ kind: 'lww-resolution' }) })
    ])
  })
})
