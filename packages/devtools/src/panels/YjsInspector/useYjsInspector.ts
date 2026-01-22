/**
 * Hook for the Yjs Inspector panel
 */

import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import type { DevToolsEvent, YjsUpdateEvent, YjsMetaChangeEvent } from '../../core/types'

export type YjsEvent = YjsUpdateEvent | YjsMetaChangeEvent

export interface DocStats {
  docId: string
  updateCount: number
  totalBytes: number
  lastUpdate: number
  localUpdates: number
  remoteUpdates: number
}

const YJS_EVENT_TYPES = new Set([
  'yjs:update',
  'yjs:meta-change',
  'yjs:state-vector',
  'yjs:provider-status'
])

export function useYjsInspector() {
  const { eventBus } = useDevTools()
  const [events, setEvents] = useState<YjsEvent[]>([])
  const [docStats, setDocStats] = useState<Map<string, DocStats>>(new Map())
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)

  // Load initial events
  useEffect(() => {
    const yjsEvents = eventBus.getEvents().filter((e) => YJS_EVENT_TYPES.has(e.type)) as YjsEvent[]
    setEvents(yjsEvents)
    rebuildStats(yjsEvents)
  }, [eventBus])

  // Subscribe to live events
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (!YJS_EVENT_TYPES.has(event.type)) return

      if (event.type === 'yjs:update' || event.type === 'yjs:meta-change') {
        const yjsEvent = event as YjsEvent
        setEvents((prev) => [...prev.slice(-499), yjsEvent])

        if (event.type === 'yjs:update') {
          const update = event as YjsUpdateEvent
          setDocStats((prev) => {
            const stats = prev.get(update.docId) || {
              docId: update.docId,
              updateCount: 0,
              totalBytes: 0,
              lastUpdate: 0,
              localUpdates: 0,
              remoteUpdates: 0
            }
            const updated = {
              ...stats,
              updateCount: stats.updateCount + 1,
              totalBytes: stats.totalBytes + update.updateSize,
              lastUpdate: update.wallTime,
              localUpdates: stats.localUpdates + (update.isLocal ? 1 : 0),
              remoteUpdates: stats.remoteUpdates + (update.isLocal ? 0 : 1)
            }
            return new Map(prev).set(update.docId, updated)
          })
        }
      }
    })
    return unsub
  }, [eventBus])

  function rebuildStats(yjsEvents: YjsEvent[]) {
    const statsMap = new Map<string, DocStats>()
    for (const event of yjsEvents) {
      if (event.type === 'yjs:update') {
        const stats = statsMap.get(event.docId) || {
          docId: event.docId,
          updateCount: 0,
          totalBytes: 0,
          lastUpdate: 0,
          localUpdates: 0,
          remoteUpdates: 0
        }
        stats.updateCount++
        stats.totalBytes += event.updateSize
        stats.lastUpdate = event.wallTime
        if (event.isLocal) stats.localUpdates++
        else stats.remoteUpdates++
        statsMap.set(event.docId, stats)
      }
    }
    setDocStats(statsMap)
  }

  // Events for selected doc
  const filteredEvents = selectedDoc ? events.filter((e) => e.docId === selectedDoc) : events

  return {
    events: filteredEvents,
    allEvents: events,
    docStats: [...docStats.values()],
    selectedDoc,
    setSelectedDoc
  }
}
