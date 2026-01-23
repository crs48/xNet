/**
 * Hook for the Yjs Inspector panel
 */

import { useState, useEffect, useCallback } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import type {
  DevToolsEvent,
  YjsUpdateEvent,
  YjsMetaChangeEvent,
  YjsStateVectorEvent
} from '../../core/types'

export type YjsEvent = YjsUpdateEvent | YjsMetaChangeEvent

export type YjsSubView = 'events' | 'structure' | 'state-vectors'

export interface DocStats {
  docId: string
  updateCount: number
  totalBytes: number
  lastUpdate: number
  localUpdates: number
  remoteUpdates: number
}

/** Tree node representing a Y.js shared type */
export interface YTreeNode {
  key: string
  type: 'Map' | 'Array' | 'Text' | 'XmlFragment' | 'XmlElement' | 'XmlText' | 'unknown'
  size: number
  children?: YTreeNode[]
  value?: string
}

/** State vector entry */
export interface StateVectorEntry {
  clientId: number
  clock: number
}

const YJS_EVENT_TYPES = new Set([
  'yjs:update',
  'yjs:meta-change',
  'yjs:state-vector',
  'yjs:provider-status'
])

export function useYjsInspector() {
  const { eventBus, yDocRegistry } = useDevTools()
  const [events, setEvents] = useState<YjsEvent[]>([])
  const [docStats, setDocStats] = useState<Map<string, DocStats>>(new Map())
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [subView, setSubView] = useState<YjsSubView>('events')
  const [docTree, setDocTree] = useState<YTreeNode[]>([])
  const [stateVector, setStateVector] = useState<StateVectorEntry[]>([])

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

      // Capture state vectors
      if (event.type === 'yjs:state-vector') {
        const sv = event as YjsStateVectorEvent
        if (selectedDoc && sv.docId === selectedDoc) {
          setStateVector(sv.entries)
        }
      }
    })
    return unsub
  }, [eventBus, selectedDoc])

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

  // Build tree from Y.Doc when selected doc or sub-view changes
  const refreshTree = useCallback(() => {
    if (!selectedDoc || subView !== 'structure') {
      setDocTree([])
      return
    }

    const docs = yDocRegistry.getDocs()
    const doc = docs.get(selectedDoc)
    if (!doc) {
      setDocTree([])
      return
    }

    const tree = buildDocTree(doc)
    setDocTree(tree)
  }, [selectedDoc, subView, yDocRegistry])

  useEffect(() => {
    refreshTree()
  }, [refreshTree])

  // Build state vector from Y.Doc when selected doc changes
  const refreshStateVector = useCallback(() => {
    if (!selectedDoc || subView !== 'state-vectors') {
      setStateVector([])
      return
    }

    const docs = yDocRegistry.getDocs()
    const doc = docs.get(selectedDoc)
    if (!doc) {
      // Check event bus for last state-vector event
      const svEvents = eventBus
        .getEvents()
        .filter(
          (e) => e.type === 'yjs:state-vector' && (e as YjsStateVectorEvent).docId === selectedDoc
        ) as YjsStateVectorEvent[]
      if (svEvents.length > 0) {
        setStateVector(svEvents[svEvents.length - 1].entries)
      }
      return
    }

    // Read state vector from live doc using internal structure
    try {
      const entries: StateVectorEntry[] = []
      const ss = (doc as any).store?.clients as Map<number, any[]> | undefined
      if (ss) {
        ss.forEach((structs: any[], clientId: number) => {
          if (structs.length > 0) {
            const lastStruct = structs[structs.length - 1]
            const clock = (lastStruct.id?.clock ?? 0) + (lastStruct.length ?? 1)
            entries.push({ clientId, clock })
          }
        })
      }
      setStateVector(entries.sort((a, b) => b.clock - a.clock))
    } catch {
      setStateVector([])
    }
  }, [selectedDoc, subView, yDocRegistry, eventBus])

  useEffect(() => {
    refreshStateVector()
  }, [refreshStateVector])

  // Events for selected doc
  const filteredEvents = selectedDoc ? events.filter((e) => e.docId === selectedDoc) : events

  return {
    events: filteredEvents,
    allEvents: events,
    docStats: [...docStats.values()],
    selectedDoc,
    setSelectedDoc,
    subView,
    setSubView,
    docTree,
    stateVector,
    refreshTree,
    refreshStateVector
  }
}

/**
 * Build a tree representation of a Y.Doc's shared types.
 * Limits depth to prevent blowups with deeply nested structures.
 */
function buildDocTree(doc: any, maxDepth = 5): YTreeNode[] {
  const nodes: YTreeNode[] = []

  try {
    // doc.share is the Map<string, AbstractType> of top-level shared types
    const share: Map<string, any> = doc.share
    if (!share) return nodes

    share.forEach((type: any, key: string) => {
      nodes.push(buildTypeNode(key, type, 0, maxDepth))
    })
  } catch {
    // Safety: if doc structure is unexpected
  }

  return nodes
}

function buildTypeNode(key: string, type: any, depth: number, maxDepth: number): YTreeNode {
  const typeName = getYTypeName(type)
  const node: YTreeNode = { key, type: typeName, size: 0 }

  if (depth >= maxDepth) {
    node.value = '(max depth)'
    return node
  }

  try {
    switch (typeName) {
      case 'Map': {
        const map = type as any
        node.size = map._map?.size ?? 0
        if (node.size > 0 && depth < maxDepth) {
          node.children = []
          const entries = map._map as Map<string, any>
          entries?.forEach((item: any, k: string) => {
            const content = item?.content
            if (content?.type) {
              // Nested shared type
              node.children!.push(buildTypeNode(k, content.type, depth + 1, maxDepth))
            } else {
              // Primitive value
              const val = content?.arr?.[0]
              node.children!.push({
                key: k,
                type: 'unknown',
                size: 0,
                value: val !== undefined ? truncateValue(val) : '(empty)'
              })
            }
          })
        }
        break
      }
      case 'Array': {
        const arr = type as any
        node.size = arr.length ?? arr._length ?? 0
        break
      }
      case 'Text': {
        const text = type as any
        const str = text.toString?.() ?? ''
        node.size = str.length
        node.value = str.length > 50 ? str.slice(0, 50) + '...' : str
        break
      }
      case 'XmlFragment':
      case 'XmlElement': {
        const xml = type as any
        node.size = xml._length ?? xml.length ?? 0
        if (node.size > 0 && depth < maxDepth) {
          node.children = []
          let child = xml._first
          let i = 0
          while (child && i < 50) {
            const childType = child.content?.type
            if (childType) {
              node.children.push(buildTypeNode(`[${i}]`, childType, depth + 1, maxDepth))
            }
            child = child.right
            i++
          }
        }
        break
      }
    }
  } catch {
    // Safety: structure access failed
  }

  return node
}

function getYTypeName(type: any): YTreeNode['type'] {
  const constructor = type?.constructor?.name ?? ''
  if (constructor.includes('Map')) return 'Map'
  if (constructor.includes('Array')) return 'Array'
  if (constructor.includes('Text')) return 'Text'
  if (constructor.includes('XmlFragment')) return 'XmlFragment'
  if (constructor.includes('XmlElement')) return 'XmlElement'
  if (constructor.includes('XmlText')) return 'XmlText'
  return 'unknown'
}

function truncateValue(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  const str = typeof val === 'string' ? val : JSON.stringify(val)
  return str.length > 40 ? str.slice(0, 40) + '...' : str
}
