/**
 * @xnet/hub - Awareness persistence service.
 */

import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness'
import type { AwarenessEntry, HubStorage } from '../storage/interface'

export type AwarenessConfig = {
  /** TTL for awareness entries (default: 24 hours) */
  ttlMs: number
  /** How often to clean stale entries (default: 1 hour) */
  cleanupIntervalMs: number
  /** Max users tracked per room (default: 100) */
  maxUsersPerRoom: number
}

const DEFAULT_CONFIG: AwarenessConfig = {
  ttlMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
  maxUsersPerRoom: 100
}

type AwarenessRoomState = {
  doc: Y.Doc
  awareness: Awareness
  clientUserMap: Map<number, string>
}

const toBytes = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const extractUserDid = (state: Record<string, unknown>): string | null => {
  if (!isRecord(state.user)) return null
  const candidate = state.user as { did?: unknown }
  return typeof candidate.did === 'string' ? candidate.did : null
}

const withUserDid = (state: Record<string, unknown>, userDid: string): Record<string, unknown> => {
  if (isRecord(state.user)) {
    const user = state.user as Record<string, unknown>
    if (user.did === userDid) return state
    return { ...state, user: { ...user, did: userDid } }
  }
  return { ...state, user: { did: userDid } }
}

const withOnlineState = (
  state: Record<string, unknown>,
  online: boolean
): AwarenessEntry['state'] => {
  if (state.online === online) {
    return state as AwarenessEntry['state']
  }
  return { ...state, online }
}

export class AwarenessService {
  private config: AwarenessConfig
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private rooms = new Map<string, AwarenessRoomState>()

  constructor(
    private storage: HubStorage,
    config?: Partial<AwarenessConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start the periodic cleanup of stale entries.
   */
  start(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => console.error('[awareness] cleanup failed', err))
    }, this.config.cleanupIntervalMs)
  }

  /**
   * Stop the cleanup timer.
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Handle an incoming awareness update payload.
   */
  async handleAwarenessMessage(
    room: string,
    userDid: string | null,
    data: Record<string, unknown>
  ): Promise<void> {
    if (typeof data.update === 'string') {
      await this.handleAwarenessUpdate(room, userDid, toBytes(data.update))
      return
    }

    if (isRecord(data.state)) {
      const state = data.state
      const resolvedDid = this.resolveUserDid(state, userDid)
      if (!resolvedDid) return
      const entry: AwarenessEntry = {
        room,
        userDid: resolvedDid,
        state: withOnlineState(withUserDid(state, resolvedDid), true),
        lastSeen: Date.now()
      }
      await this.storage.setAwareness(entry)
    }
  }

  /**
   * Get the awareness snapshot for a room.
   */
  async getSnapshot(room: string): Promise<AwarenessEntry[]> {
    const entries = await this.storage.getAwareness(room)
    const cutoff = Date.now() - this.config.ttlMs

    return entries.filter((entry) => entry.lastSeen > cutoff).slice(0, this.config.maxUsersPerRoom)
  }

  /**
   * Mark a user as offline in a room.
   */
  async handleDisconnect(room: string, userDid: string): Promise<void> {
    const entries = await this.storage.getAwareness(room)
    const existing = entries.find((entry) => entry.userDid === userDid)
    if (!existing) return

    const updated: AwarenessEntry = {
      ...existing,
      state: withOnlineState(existing.state as Record<string, unknown>, false),
      lastSeen: Date.now()
    }

    await this.storage.setAwareness(updated)
  }

  private getRoomState(room: string): AwarenessRoomState {
    const existing = this.rooms.get(room)
    if (existing) return existing

    const doc = new Y.Doc({ guid: room, gc: false })
    const awareness = new Awareness(doc)
    const state: AwarenessRoomState = {
      doc,
      awareness,
      clientUserMap: new Map()
    }
    this.rooms.set(room, state)
    return state
  }

  private async handleAwarenessUpdate(
    room: string,
    userDid: string | null,
    update: Uint8Array
  ): Promise<void> {
    const roomState = this.getRoomState(room)
    const { awareness, clientUserMap } = roomState

    let change: { added: number[]; updated: number[]; removed: number[] } | null = null
    const handler = (payload: { added: number[]; updated: number[]; removed: number[] }) => {
      change = payload
    }

    awareness.on('update', handler)
    applyAwarenessUpdate(awareness, update, 'hub')
    awareness.off('update', handler)

    if (!change) return

    const now = Date.now()
    const states = awareness.getStates()

    for (const clientId of [...change.added, ...change.updated]) {
      const state = states.get(clientId)
      if (!isRecord(state)) continue
      const resolvedDid = this.resolveUserDid(state, userDid)
      if (!resolvedDid) continue
      clientUserMap.set(clientId, resolvedDid)

      const entry: AwarenessEntry = {
        room,
        userDid: resolvedDid,
        state: withOnlineState(withUserDid(state, resolvedDid), true),
        lastSeen: now
      }
      await this.storage.setAwareness(entry)
    }

    for (const clientId of change.removed) {
      const removedDid = clientUserMap.get(clientId)
      if (removedDid) {
        clientUserMap.delete(clientId)
        await this.handleDisconnect(room, removedDid)
      }
    }
  }

  private resolveUserDid(state: Record<string, unknown>, fallback: string | null): string | null {
    const fromState = extractUserDid(state)
    if (fallback && fallback !== 'did:key:anonymous') {
      return fallback
    }
    return fromState ?? fallback
  }

  private async cleanup(): Promise<void> {
    const removed = await this.storage.cleanStaleAwareness(this.config.ttlMs)
    if (removed > 0) {
      console.info(`[awareness] Cleaned ${removed} stale entries`)
    }
  }
}
