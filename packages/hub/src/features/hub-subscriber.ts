/**
 * @xnetjs/hub - Hub-to-hub Space subscription (explorations 0258/0382/0383 W4).
 *
 * The literal hub-of-hubs primitive, built by COMPOSITION rather than new
 * protocol: the subscribing hub embeds the client-side `MultiHubSyncManager`
 * (one per peer — the manager multiplexes rooms over that peer's single
 * socket) and speaks the hub's existing wire protocol as an ordinary client:
 *
 *   subscribe {topics:[room]}          → join the live tail
 *   node-sync-request {room, since}    → backfill from the persisted
 *                                        high-water mark, paged via hasMore —
 *                                        which is what lets a mirror survive
 *                                        the PEER's restart, not just ours
 *   publish/node-change               → the live tail itself
 *
 * State discipline (0383): the mirror is DERIVED state, persisted as
 * `sub_<peer>.json` files (the W2 prefix rule), folded per node in lamport
 * order (LWW — the same fold `node-relay` uses), and served ONLY under
 * `/sub/*` routes. It is never written into rooms, the change log, or the
 * public read surface — so a hub subscribing to THIS hub can never receive
 * mirrored third-party state. **No transitive re-export, by construction**:
 * that is the invariant that makes subscription cycles harmless (A⊂B⊂A
 * amplification has no path), while direct self-subscription is rejected at
 * startup.
 *
 * Scope (W4 v1): PUBLIC Spaces — the peer must serve the room to this hub's
 * connection (auth off, or a capability the operator provisioned). The 0258
 * trust tiers ride along: each peer's `trust` reaches the embedded manager,
 * whose publish path withholds plaintext from zero-knowledge destinations —
 * enforcement this subscriber inherits for free when the gateway ever writes.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createMultiHubSyncManager,
  type HubTransport,
  type MultiHubSyncManager,
  type ReplicaTrust
} from '@xnetjs/runtime'
import { WebSocket } from 'ws'
import type { SerializedNodeChange } from '../storage/interface'
import type { HubFeature } from './types'

export interface SubscriptionPeer {
  /** Stable peer id — also the mirror's namespace (`sub_<id>.json`). */
  id: string
  /** The peer hub's ws URL. */
  url: string
  /** The room carrying the public Space's node changes. */
  room: string
  /** 0258 trust class, forwarded to the embedded manager's publish gate. */
  trust?: ReplicaTrust
}

export interface HubSubscriptionsConfig {
  enabled: boolean
  peers?: SubscriptionPeer[]
  /** Reconnect backoff base (default 1s; doubles to 30s max). */
  reconnectDelayMs?: number
}

interface MirroredNode {
  nodeId: string
  schemaId: string | null
  properties: Record<string, unknown>
  lamportTime: number
  deleted?: boolean
}

interface Mirror {
  highWaterMark: number
  nodes: Map<string, MirroredNode>
}

const peerFileName = (peerId: string): string =>
  `sub_${peerId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`

/**
 * A `HubTransport` over one Node ws connection to a peer hub: subscribe on
 * open, backfill via node-sync-request, auto-reconnect with resubscribe +
 * re-backfill. All rooms multiplex over the single socket — the manager's
 * O(1)-sockets-per-hub promise, kept on the server side too.
 */
class NodeWsPeerTransport implements HubTransport {
  private ws: WebSocket | null = null
  private rooms = new Map<string, Set<(data: Record<string, unknown>) => void>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private attempt = 0

  constructor(
    private readonly url: string,
    private readonly sinceFor: (room: string) => number,
    private readonly baseDelayMs: number
  ) {}

  connect(): void {
    this.closed = false
    this.open()
  }

  disconnect(): void {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  joinRoom(room: string, handler: (data: Record<string, unknown>) => void): () => void {
    let handlers = this.rooms.get(room)
    const isNewRoom = !handlers
    if (!handlers) {
      handlers = new Set()
      this.rooms.set(room, handlers)
    }
    handlers.add(handler)
    if (isNewRoom && this.ws?.readyState === WebSocket.OPEN) {
      this.subscribeAndBackfill(room)
    }
    return () => {
      const set = this.rooms.get(room)
      set?.delete(handler)
      if (set && set.size === 0) this.rooms.delete(room)
    }
  }

  publish(room: string, data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'publish', topic: room, data }))
    }
  }

  private open(): void {
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.on('open', () => {
      this.attempt = 0
      // Resubscribe every room and re-backfill from the persisted mark — this
      // is what makes the mirror survive the peer's restart.
      for (const room of this.rooms.keys()) this.subscribeAndBackfill(room)
    })
    ws.on('message', (data) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(String(data)) as Record<string, unknown>
      } catch {
        return
      }
      this.dispatch(parsed)
    })
    ws.on('close', () => this.scheduleReconnect())
    ws.on('error', () => {
      /* close follows; reconnect there */
    })
  }

  private subscribeAndBackfill(room: string): void {
    this.ws?.send(JSON.stringify({ type: 'subscribe', topics: [room] }))
    this.ws?.send(
      JSON.stringify({ type: 'node-sync-request', room, sinceLamport: this.sinceFor(room) })
    )
  }

  private dispatch(message: Record<string, unknown>): void {
    // Backfill pages: `node-sync-response {room, changes, highWaterMark, hasMore}`.
    if (message.type === 'node-sync-response' && typeof message.room === 'string') {
      this.rooms.get(message.room)?.forEach((handler) => handler(message))
      if (message.hasMore === true && typeof message.highWaterMark === 'number') {
        this.ws?.send(
          JSON.stringify({
            type: 'node-sync-request',
            room: message.room,
            sinceLamport: message.highWaterMark
          })
        )
      }
      return
    }
    // Live tail: `publish {topic, data:{type:'node-change', change}}` (and the
    // unwrapped broadcast form).
    if (message.type === 'publish' && typeof message.topic === 'string') {
      const data = message.data as Record<string, unknown> | undefined
      if (data && typeof data === 'object') this.rooms.get(message.topic)?.forEach((h) => h(data))
      return
    }
    if (message.type === 'node-change' && typeof message.room === 'string') {
      this.rooms.get(message.room)?.forEach((handler) => handler(message))
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    const delay = Math.min(this.baseDelayMs * 2 ** this.attempt, 30_000)
    this.attempt++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
    this.reconnectTimer.unref?.()
  }
}

export class HubSubscriberService {
  private mirrors = new Map<string, Mirror>()
  private managers: MultiHubSyncManager[] = []

  constructor(
    private readonly dataDir: string,
    private readonly peers: SubscriptionPeer[],
    private readonly reconnectDelayMs = 1000
  ) {}

  /**
   * Direct self-subscription is a config error, caught at startup. Transitive
   * cycles need no detection at all: mirrored state is never re-exported, so
   * a cycle cannot amplify (see module docstring).
   */
  assertNoSelfSubscription(publicUrl: string | undefined, port: number): void {
    if (!publicUrl && !port) return
    for (const peer of this.peers) {
      const self =
        (publicUrl &&
          peer.url.replace(/^ws/, 'http').startsWith(publicUrl.replace(/^ws/, 'http'))) ||
        peer.url.includes(`localhost:${port}`) ||
        peer.url.includes(`127.0.0.1:${port}`)
      if (self) {
        throw new Error(
          `[hub-subscriber] subscription "${peer.id}" points at this hub itself (${peer.url}) — ` +
            `a hub cannot subscribe to its own Space (0383 W4 cycle guard).`
        )
      }
    }
  }

  start(): void {
    mkdirSync(this.dataDir, { recursive: true })
    for (const peer of this.peers) {
      const mirror = this.loadMirror(peer.id)
      const transport = new NodeWsPeerTransport(
        peer.url,
        () => mirror.highWaterMark,
        this.reconnectDelayMs
      )
      // One embedded manager per peer: the default (no policy) plan is a full
      // mirror to that peer, and the 0258 trust class rides on the connection
      // so the manager's plaintext gate applies to anything the gateway ever
      // publishes back.
      const manager = createMultiHubSyncManager({
        hubs: [{ hubId: peer.id, url: peer.url, transport, trust: peer.trust }],
        roomForNode: () => peer.room
      })
      manager.connect()
      manager.joinScopedRoom(peer.room, `xnet://sub/${peer.id}/`, (data) =>
        this.apply(peer.id, data)
      )
      this.managers.push(manager)
    }
  }

  stop(): void {
    for (const manager of this.managers) manager.disconnect()
    this.managers = []
    for (const peerId of this.mirrors.keys()) this.persist(peerId)
  }

  status(): Array<{ peer: string; nodes: number; highWaterMark: number }> {
    return this.peers.map((peer) => {
      const mirror = this.mirrors.get(peer.id)
      return {
        peer: peer.id,
        nodes: mirror?.nodes.size ?? 0,
        highWaterMark: mirror?.highWaterMark ?? 0
      }
    })
  }

  nodesFor(peerId: string): MirroredNode[] {
    const mirror = this.mirrors.get(peerId)
    return mirror ? [...mirror.nodes.values()].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1)) : []
  }

  nodeFor(peerId: string, nodeId: string): MirroredNode | null {
    return this.mirrors.get(peerId)?.nodes.get(nodeId) ?? null
  }

  /** Fold one frame into the peer's mirror (sync-response page or live change). */
  private apply(peerId: string, data: Record<string, unknown>): void {
    const mirror = this.loadMirror(peerId)
    if (data.type === 'node-sync-response' && Array.isArray(data.changes)) {
      for (const change of data.changes as SerializedNodeChange[]) {
        this.fold(mirror, change)
      }
      if (typeof data.highWaterMark === 'number' && data.highWaterMark > mirror.highWaterMark) {
        mirror.highWaterMark = data.highWaterMark
      }
      this.persist(peerId)
      return
    }
    if (data.type === 'node-change' && data.change && typeof data.change === 'object') {
      this.fold(mirror, data.change as SerializedNodeChange)
      this.persist(peerId)
    }
  }

  /** LWW per node in lamport order — the same fold the node relay uses. */
  private fold(mirror: Mirror, change: SerializedNodeChange): void {
    if (typeof change?.nodeId !== 'string' || typeof change.lamportTime !== 'number') return
    const payload = change.payload as
      | { properties?: Record<string, unknown>; deleted?: boolean; schemaId?: string }
      | undefined
    const existing = mirror.nodes.get(change.nodeId)
    if (existing && existing.lamportTime > change.lamportTime) return
    mirror.nodes.set(change.nodeId, {
      nodeId: change.nodeId,
      schemaId: change.schemaId ?? payload?.schemaId ?? existing?.schemaId ?? null,
      properties: { ...existing?.properties, ...payload?.properties },
      lamportTime: change.lamportTime,
      ...(payload?.deleted ? { deleted: true } : {})
    })
    if (change.lamportTime > mirror.highWaterMark) mirror.highWaterMark = change.lamportTime
  }

  private loadMirror(peerId: string): Mirror {
    let mirror = this.mirrors.get(peerId)
    if (mirror) return mirror
    const path = join(this.dataDir, peerFileName(peerId))
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        highWaterMark: number
        nodes: MirroredNode[]
      }
      mirror = {
        highWaterMark: parsed.highWaterMark,
        nodes: new Map(parsed.nodes.map((n) => [n.nodeId, n]))
      }
    } else {
      mirror = { highWaterMark: 0, nodes: new Map() }
    }
    this.mirrors.set(peerId, mirror)
    return mirror
  }

  private persist(peerId: string): void {
    const mirror = this.mirrors.get(peerId)
    if (!mirror) return
    writeFileSync(
      join(this.dataDir, peerFileName(peerId)),
      JSON.stringify({
        highWaterMark: mirror.highWaterMark,
        nodes: [...mirror.nodes.values()].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1))
      })
    )
  }
}

/**
 * The subscriber as a feature: read-only `/sub/*` routes over the mirrors,
 * lifecycle owned by the registry. Mirrors are served here and NOWHERE else —
 * the no-transitive-re-export invariant lives in this file's route list.
 */
export function hubSubscriberFeature(
  dataDir: string,
  config: HubSubscriptionsConfig,
  self: { publicUrl: string | undefined; port: number }
): HubFeature {
  const service = new HubSubscriberService(dataDir, config.peers ?? [], config.reconnectDelayMs)
  service.assertNoSelfSubscription(self.publicUrl, self.port)

  return {
    id: 'fyi.xnet.hub.subscriber',
    services: () => ({ service }),
    mount: ({ app }) => {
      app.get('/sub/status', (c) => c.json({ subscriptions: service.status() }))
      app.get('/sub/:peer/nodes', (c) => c.json({ nodes: service.nodesFor(c.req.param('peer')) }))
      app.get('/sub/:peer/node/:nodeId', (c) => {
        const node = service.nodeFor(c.req.param('peer'), c.req.param('nodeId'))
        return node ? c.json({ node }) : c.json({ error: 'NOT_MIRRORED' }, 404)
      })
    },
    loops: [
      {
        id: 'peer-subscriptions',
        start: () => service.start(),
        stop: () => service.stop()
      }
    ]
  }
}
