/**
 * Hook for the Change Timeline panel
 */

import type {
  DevToolsEvent,
  StoreCreateEvent,
  StoreUpdateEvent,
  StoreDeleteEvent,
  StoreRestoreEvent,
  StoreRemoteChangeEvent,
  StoreConflictEvent
} from '../../core/types'
import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export type TimelineEvent =
  | StoreCreateEvent
  | StoreUpdateEvent
  | StoreDeleteEvent
  | StoreRestoreEvent
  | StoreRemoteChangeEvent
  | StoreConflictEvent

const STORE_EVENT_TYPES = new Set([
  'store:create',
  'store:update',
  'store:delete',
  'store:restore',
  'store:remote-change',
  'store:conflict'
])

export function useChangeTimeline() {
  const { eventBus } = useDevTools()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [nodeFilter, setNodeFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Load initial events from buffer
  useEffect(() => {
    const storeEvents = eventBus
      .getEvents()
      .filter((e) => STORE_EVENT_TYPES.has(e.type)) as TimelineEvent[]
    setEvents(storeEvents)
  }, [eventBus])

  // Subscribe to live events
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (STORE_EVENT_TYPES.has(event.type)) {
        setEvents((prev) => [...prev.slice(-999), event as TimelineEvent])
      }
    })
    return unsub
  }, [eventBus])

  // Filtered events
  const filteredEvents = events.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false
    if (nodeFilter) {
      const nodeId = 'nodeId' in e ? (e as any).nodeId : ''
      return nodeId.toLowerCase().includes(nodeFilter.toLowerCase())
    }
    return true
  })

  return {
    events: filteredEvents,
    allEvents: events,
    selectedEvent,
    setSelectedEvent,
    nodeFilter,
    setNodeFilter,
    typeFilter,
    setTypeFilter,
    autoScroll,
    setAutoScroll
  }
}
