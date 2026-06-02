/**
 * Tests for QueryTracker instrumentation.
 */

import { describe, expect, it } from 'vitest'
import { DevToolsEventBus } from '../core/event-bus'
import { QueryTracker } from './query'

describe('QueryTracker', () => {
  it('should emit and retain query stream timeline events', () => {
    const bus = new DevToolsEventBus()
    const tracker = new QueryTracker(bus)

    tracker.register('query-1', {
      type: 'useQuery',
      schemaId: 'xnet://test/Task',
      mode: 'list'
    })

    tracker.recordStreamEvent(
      'query-1',
      {
        status: 'ready',
        lastEvent: 'snapshot',
        lastEventAt: 123,
        progress: { phase: 'live' }
      },
      2,
      { source: 'hub' }
    )

    expect(bus.getEventsByType('query:stream-event')).toEqual([
      expect.objectContaining({
        type: 'query:stream-event',
        queryId: 'query-1',
        resultCount: 2,
        source: 'hub',
        stream: expect.objectContaining({
          status: 'ready',
          lastEvent: 'snapshot',
          lastEventAt: 123,
          progress: { phase: 'live' }
        })
      })
    ])
    expect(tracker.getById('query-1')?.streamTimeline).toEqual([
      expect.objectContaining({
        status: 'ready',
        lastEvent: 'snapshot'
      })
    ])
  })
})
