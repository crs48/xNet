/**
 * usePresence - presence hook with historical awareness snapshot support.
 */

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness'
import { XNetContext } from '../context'

export interface PresenceUser {
  did: string
  name?: string
  color?: string
  cursor?: { anchor: number; head: number }
  online: boolean
  lastSeen: number
}

const ROOM_PREFIX = 'xnet-doc-'

const toRoom = (value: string): string =>
  value.startsWith(ROOM_PREFIX) ? value : `${ROOM_PREFIX}${value}`

const fromBase64 = (value: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'))
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const generateColor = (seed: string): string => {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  const s = 0.7
  const l = 0.5
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (hue < 60) {
    r = c
    g = x
    b = 0
  } else if (hue < 120) {
    r = x
    g = c
    b = 0
  } else if (hue < 180) {
    r = 0
    g = c
    b = x
  } else if (hue < 240) {
    r = 0
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }
  const toHex = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const parsePresenceState = (state: Record<string, unknown>): Omit<PresenceUser, 'online' | 'lastSeen'> | null => {
  const user = isRecord(state.user) ? state.user : null
  const did = user && typeof user.did === 'string' ? user.did : null
  if (!did) return null

  return {
    did,
    name: typeof user.name === 'string' ? user.name : undefined,
    color: typeof user.color === 'string' ? user.color : generateColor(did),
    cursor: isRecord(state.cursor)
      ? {
          anchor: Number(state.cursor.anchor ?? 0),
          head: Number(state.cursor.head ?? 0)
        }
      : undefined
  }
}

export const usePresence = (roomId: string): { users: PresenceUser[] } => {
  const context = useContext(XNetContext)
  const connection = context?.hubConnection ?? context?.syncManager?.connection ?? null

  const [users, setUsers] = useState<PresenceUser[]>([])

  const awarenessRef = useRef<Awareness | null>(null)
  const snapshotRef = useRef<Map<string, PresenceUser>>(new Map())
  const lastSeenRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!roomId || !connection) {
      setUsers([])
      return
    }

    const room = toRoom(roomId)
    const doc = new Y.Doc({ gc: false })
    const awareness = new Awareness(doc)
    awarenessRef.current = awareness

    const updateUsers = () => {
      const onlineMap = new Map<string, PresenceUser>()
      awareness.getStates().forEach((state) => {
        if (!isRecord(state)) return
        const parsed = parsePresenceState(state)
        if (!parsed) return
        const lastSeen = lastSeenRef.current.get(parsed.did) ?? Date.now()
        onlineMap.set(parsed.did, { ...parsed, online: true, lastSeen })
      })

      const merged: PresenceUser[] = [...onlineMap.values()]
      for (const snapshot of snapshotRef.current.values()) {
        if (!onlineMap.has(snapshot.did)) {
          merged.push({ ...snapshot, online: false })
        }
      }

      merged.sort((a, b) => b.lastSeen - a.lastSeen)
      setUsers(merged)
    }

    const handleAwarenessUpdate = (payload: { added: number[]; updated: number[] }) => {
      const states = awareness.getStates()
      for (const clientId of [...payload.added, ...payload.updated]) {
        const state = states.get(clientId)
        if (!isRecord(state)) continue
        const parsed = parsePresenceState(state)
        if (!parsed) continue
        lastSeenRef.current.set(parsed.did, Date.now())
      }
      updateUsers()
    }

    awareness.on('update', handleAwarenessUpdate)

    const unsubscribe = connection.joinRoom(room, (data) => {
      if (!isRecord(data) || typeof data.type !== 'string') return

      if (data.type === 'awareness' && typeof data.update === 'string') {
        applyAwarenessUpdate(awareness, fromBase64(data.update), 'remote')
        return
      }

      if (data.type === 'awareness-snapshot' && Array.isArray(data.users)) {
        for (const user of data.users) {
          if (!isRecord(user)) continue
          const did = typeof user.did === 'string' ? user.did : null
          if (!did) continue
          const state = isRecord(user.state) ? user.state : {}
          const parsed = parsePresenceState(state)
          if (!parsed) continue
          const lastSeen = typeof user.lastSeen === 'number' ? user.lastSeen : Date.now()
          const existing = lastSeenRef.current.get(did) ?? 0
          if (lastSeen > existing) {
            lastSeenRef.current.set(did, lastSeen)
          }
          snapshotRef.current.set(did, {
            ...parsed,
            online: false,
            lastSeen: lastSeenRef.current.get(did) ?? lastSeen
          })
        }
        updateUsers()
      }
    })

    return () => {
      unsubscribe()
      awareness.off('update', handleAwarenessUpdate)
      awarenessRef.current = null
      doc.destroy()
      setUsers([])
    }
  }, [connection, roomId])

  return useMemo(() => ({ users }), [users])
}
