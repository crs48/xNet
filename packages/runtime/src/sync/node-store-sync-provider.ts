/**
 * NodeStoreSyncProvider - Sync NodeChange events via hub ConnectionManager.
 *
 * Anti-flood design (exploration 0206):
 *  - A persisted per-room cursor (lastSyncedLamport) is loaded on connect, so
 *    a reload no longer replays the entire change log (getChangesSince(0)).
 *  - Request-sync-first: on connect we ask the hub for its high-water mark
 *    before pushing, so when the hub is already ahead we push nothing.
 *  - A throttled send queue caps outbound node-change messages per second so a
 *    genuine backlog can't trip the hub's per-connection rate limiter (1008).
 */
import type { ConnectionManager } from './connection-manager'
import type { ContentId, DID } from '@xnetjs/core'
import type { NodeChange, NodePayload, NodeStore } from '@xnetjs/data'
import { base64ToBytes, bytesToBase64 } from '@xnetjs/crypto'

// ─── Known Change Types ─────────────────────────────────────────────────────
// Change types that this version knows how to process.
// Unknown types are stored but not processed (forward compatibility).
const KNOWN_CHANGE_TYPES = new Set(['node-change'])

// Outbound throttle: at most MAX_SENDS_PER_WINDOW node-change messages per
// SEND_WINDOW_MS, comfortably under the hub's 100 msg/sec limit while leaving
// headroom for awareness/doc-sync traffic on the same connection (0206).
const MAX_SENDS_PER_WINDOW = 40
const SEND_WINDOW_MS = 1000

// How long to wait for the hub's node-sync-response before pushing local
// changes anyway (request-sync-first, with a fallback so we never hang).
const SYNC_RESPONSE_TIMEOUT_MS = 4000

// Protocol-skew circuit breaker. These rejection codes are *structural*: the
// hub is saying the change is fundamentally unacceptable (bad hash, bad
// signature, malformed). Re-sending the same change — or, when it's a
// protocol/build skew, ANY local change — will be rejected identically, so
// retrying just floods the hub forever (the symptom this guards against). After
// MAX_STRUCTURAL_REJECTIONS in a row we stop pushing until the next reconnect.
const STRUCTURAL_REJECTION_CODES = new Set(['INVALID_HASH', 'INVALID_SIGNATURE', 'INVALID_CHANGE'])
const MAX_STRUCTURAL_REJECTIONS = 5

// How many changes the outbound resync enqueues between event-loop yields, so a
// large first-sync slice can't monopolise a frame (exploration 0253). 1024 keeps
// per-batch work well under a frame while the yield count stays tiny.
const OUTBOUND_ENQUEUE_BATCH = 1024

// A resync at/above either bound gets a one-line diagnostic warn (self-gating, so
// steady-state sync stays silent). These name the residual cold-open main-thread
// cost — the synchronous JSON.parse-per-row deserialize inside getChangesSince.
const HEAVY_RESYNC_CHANGES = 5000
const HEAVY_RESYNC_MS = 250

/** Monotonic clock in ms, falling back to Date.now where performance is absent. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** Yield a macrotask so the browser can paint / handle input between batches. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * The share room that carries a channel's nodes to its grantees (0298). Must
 * match the hub's `channelShareRoom` so `topicToResource` resolves the grant.
 */
export const channelShareRoom = (channelId: string): string => `xnet-channel-${channelId}`

/** The share room that carries a workspace (bench) node to its grantees (0298). */
export const workspaceShareRoom = (workspaceId: string): string => `xnet-workspace-${workspaceId}`

export type SerializedNodeChange = {
  id: string
  type: string
  hash: string
  room: string
  nodeId: string
  schemaId?: string
  lamportTime: number
  lamportAuthor: string
  authorDid: string
  wallTime: number
  parentHash: string | null
  payload: NodePayload
  signatureB64: string
  protocolVersion?: number
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

export type NodeSyncResponse = {
  type: 'node-sync-response'
  room: string
  changes: SerializedNodeChange[]
  highWaterMark: number
}

/**
 * Listener for unknown change type events.
 */
export type UnknownChangeTypeListener = (change: NodeChange, peerId: string) => void

/**
 * The hub is refusing further writes for a capacity reason (exploration 0291):
 * `QUOTA_EXCEEDED` — this identity is over the hub's per-user cap (demo mode);
 * `STORAGE_FULL` — the hub's volume is full and it is shedding writes.
 * Local data is untouched; outbound sync pauses until the next reconnect.
 */
export type SyncBlockedReason = 'QUOTA_EXCEEDED' | 'STORAGE_FULL'
export type SyncBlockedListener = (reason: SyncBlockedReason, detail: string) => void

const CAPACITY_REJECTION_CODES = new Set<SyncBlockedReason>(['QUOTA_EXCEEDED', 'STORAGE_FULL'])

export class NodeStoreSyncProvider {
  /** Confirmed, persisted high-water mark (advanced from the hub's response). */
  private lastSyncedLamport = 0
  /** Optimistic in-memory cursor: lamport of the last change actually sent. */
  private pushedThrough = 0
  private cursorLoaded = false

  private connection: ConnectionManager | null = null
  private roomCleanup: (() => void) | null = null
  private statusCleanup: (() => void) | null = null
  private messageCleanup: (() => void) | null = null
  private storeCleanup: (() => void) | null = null
  private unknownChangeTypeListeners = new Set<UnknownChangeTypeListener>()
  private syncBlockedListeners = new Set<SyncBlockedListener>()

  // Throttled send queue.
  private sendQueue: NodeChange[] = []
  private queuedHashes = new Set<string>()
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private sentInWindow = 0

  // Request-sync-first: resolver for the in-flight node-sync-response wait.
  private syncResponseResolver: (() => void) | null = null

  // Protocol-skew circuit breaker state. `structuralRejections` counts
  // consecutive structural node-errors (reset on forward progress); once it
  // trips, `outboundHalted` stops all pushes until the next reconnect.
  private structuralRejections = 0
  private outboundHalted = false

  // Resolver for an in-flight node-clear ("reset my data") round-trip.
  private clearResolver: ((cleared: number) => void) | null = null

  // One-shot: emit a performance mark when the first remote change BEGINS
  // applying to the local store (marked just before the awaited write, so it
  // captures when the inbound write burst starts contending with reads on the
  // single SQLite worker). Makes that contention visible on the boot timeline
  // and in DevTools (exploration 0212).
  private firstRemoteApplyMarked = false

  /**
   * Subscribe-only providers (channel share rooms, 0298) RECEIVE and apply a
   * room's changes but never publish local changes into it (the hub owns
   * fan-out) and never advance the cursor from a live broadcast's author
   * lamport — a share room's cursor is a per-room `seq` carried opaquely in the
   * sync-response high-water mark, and author lamports across members are not
   * mutually ordered.
   */
  constructor(
    private store: NodeStore,
    private room: string,
    private subscribeOnly = false,
    /**
     * Outbound exclusion (exploration 0329): return false to keep a change
     * out of this room entirely (live subscribe AND cursor backfill both
     * funnel through `enqueueChange`). Used to keep device-local draft
     * clones out of the personal node-sync room.
     */
    private shouldPublish?: (change: NodeChange) => boolean
  ) {}

  /**
   * Mark the first remote apply once. Platform-agnostic and defensive: a
   * missing `performance` global, or a throw, is a no-op — instrumentation
   * must never break sync.
   */
  private markFirstRemoteApply(): void {
    if (this.firstRemoteApplyMarked) return
    this.firstRemoteApplyMarked = true
    try {
      performance?.mark?.('xnet:sync:first-remote-apply')
    } catch {
      // no-op
    }
  }

  /**
   * Subscribe to unknown change type events.
   * These are changes received from peers with types this version doesn't know how to process.
   * The changes are still stored in the change log for forward compatibility.
   *
   * @param listener - Callback invoked when an unknown change type is received
   * @returns Unsubscribe function
   */
  onUnknownChangeType(listener: UnknownChangeTypeListener): () => void {
    this.unknownChangeTypeListeners.add(listener)
    return () => {
      this.unknownChangeTypeListeners.delete(listener)
    }
  }

  private emitUnknownChangeType(change: NodeChange, peerId: string): void {
    for (const listener of this.unknownChangeTypeListeners) {
      try {
        listener(change, peerId)
      } catch (err) {
        console.error('Error in unknown change type listener:', err)
      }
    }
  }

  attach(connection: ConnectionManager): void {
    this.connection = connection

    this.roomCleanup = connection.joinRoom(this.room, (data) => {
      this.handleRoomMessage(data)
    })

    this.messageCleanup = connection.onMessage((message) => {
      this.handleDirectMessage(message)
    })

    this.statusCleanup = connection.onStatus((status) => {
      if (status === 'connected') {
        void this.onConnected()
      } else {
        this.onDisconnected()
      }
    })

    // Subscribe-only rooms receive but never publish local changes into the room.
    if (!this.subscribeOnly) {
      this.storeCleanup = this.store.subscribe((event) => {
        if (event.isRemote) return
        this.enqueueChange(event.change)
      })
    }

    if (connection.status === 'connected') {
      void this.onConnected()
    }
  }

  detach(): void {
    this.roomCleanup?.()
    this.statusCleanup?.()
    this.messageCleanup?.()
    this.storeCleanup?.()
    this.roomCleanup = null
    this.statusCleanup = null
    this.messageCleanup = null
    this.storeCleanup = null
    this.connection = null
    this.clearSendQueue()
    this.resolveSyncResponse()
    this.resolveClear(0)
  }

  // ─── Connect lifecycle ──────────────────────────────────────────────────

  /**
   * On connect: load the persisted cursor, ask the hub for its high-water mark
   * FIRST, then push only the changes the hub is actually missing. Combined
   * with the persisted cursor, a normal reload of an in-sync workspace pushes
   * nothing (exploration 0206).
   */
  private async onConnected(): Promise<void> {
    // A reconnect is a fresh start: clear any tripped breaker so an upgraded (or
    // simply different) hub gets a chance to accept our changes again.
    this.outboundHalted = false
    this.structuralRejections = 0

    await this.ensureCursorLoaded()
    if (!this.connection || this.connection.status !== 'connected') return

    this.requestSync()
    await this.waitForSyncResponse()
    // Subscribe-only rooms never push local changes (the hub fans them in).
    if (!this.subscribeOnly) await this.syncLocalChanges()
  }

  private onDisconnected(): void {
    // Drop the in-flight queue; syncLocalChanges() rebuilds it from
    // pushedThrough (which only advances on a real send) when we reconnect, so
    // nothing is lost and nothing is double-queued.
    this.clearSendQueue()
    this.resolveSyncResponse()
  }

  private async ensureCursorLoaded(): Promise<void> {
    if (this.cursorLoaded) return
    try {
      const stored = await this.store.getSyncCursor(this.room)
      this.lastSyncedLamport = Math.max(this.lastSyncedLamport, stored)
      this.pushedThrough = Math.max(this.pushedThrough, this.lastSyncedLamport)
    } catch (err) {
      console.warn('[NodeStoreSync] failed to load sync cursor; replaying from 0:', err)
    }
    this.cursorLoaded = true
  }

  private waitForSyncResponse(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.syncResponseResolver = resolve
      setTimeout(() => this.resolveSyncResponse(), SYNC_RESPONSE_TIMEOUT_MS)
    })
  }

  private resolveSyncResponse(): void {
    const resolve = this.syncResponseResolver
    this.syncResponseResolver = null
    resolve?.()
  }

  /**
   * Ask the hub to wipe every stored change for this room ("reset my data"),
   * then reset the local sync cursor so a later sync re-pulls from scratch.
   * Resolves with the number of changes the hub removed (0 on timeout or when
   * offline). Pairs with a local wipe + reload for a full reset.
   */
  async clearRoom(): Promise<number> {
    if (!this.connection || this.connection.status !== 'connected') return 0

    const cleared = await new Promise<number>((resolve) => {
      this.clearResolver = resolve
      this.connection?.sendRaw({ type: 'node-clear', room: this.room })
      setTimeout(() => this.resolveClear(0), SYNC_RESPONSE_TIMEOUT_MS)
    })

    // Forget our place: the room is empty, so the next sync starts from 0.
    this.lastSyncedLamport = 0
    this.pushedThrough = 0
    this.cursorLoaded = true
    try {
      await this.store.setSyncCursor(this.room, 0)
    } catch {
      // Cursor persistence is best-effort; a local wipe clears it anyway.
    }

    return cleared
  }

  private resolveClear(cleared: number): void {
    const resolve = this.clearResolver
    this.clearResolver = null
    resolve?.(cleared)
  }

  // ─── Inbound ────────────────────────────────────────────────────────────

  private handleRoomMessage(data: Record<string, unknown>): void {
    if (data.type === 'node-change') {
      const change = data.change as SerializedNodeChange
      void this.handleRemoteChange(change)
    }
  }

  private handleDirectMessage(message: Record<string, unknown>): void {
    if (message.type === 'node-cleared') {
      if (message.room === this.room) {
        this.resolveClear(typeof message.cleared === 'number' ? message.cleared : 0)
      }
      return
    }
    if (message.type === 'node-error') {
      // The hub rejected a change (invalid/unauthorized/duplicate). Log it and
      // move on — don't treat it as a reason to resend and re-flood (0206).
      const code = typeof message.code === 'string' ? message.code : 'UNKNOWN'
      console.warn(
        '[NodeStoreSync] hub rejected a node change:',
        code,
        message.error ?? message.message ?? ''
      )
      if (STRUCTURAL_REJECTION_CODES.has(code)) {
        this.recordStructuralRejection(code, message)
      }
      if (CAPACITY_REJECTION_CODES.has(code as SyncBlockedReason)) {
        this.recordCapacityRejection(code as SyncBlockedReason, message)
      }
      return
    }
    if (message.type !== 'node-sync-response') return
    const response = message as NodeSyncResponse
    if (response.room !== this.room) return
    void this.handleSyncResponse(response)
  }

  /**
   * Trip the circuit breaker after enough consecutive structural rejections.
   *
   * Structural rejections (bad hash/signature/shape) are not transient: the
   * same change re-sent is rejected again, and — when it's a protocol/build
   * skew — so is every other local change. Rather than re-flood the hub forever
   * (the symptom that motivated this), we stop pushing, drop the queue, and log
   * ONE actionable error. A reconnect clears the breaker (the hub may have been
   * upgraded) via {@link onConnected}, and any forward progress resets the
   * counter so sparse one-off rejections never accumulate to a false trip.
   */
  private recordStructuralRejection(code: string, message: Record<string, unknown>): void {
    this.structuralRejections += 1
    if (this.outboundHalted || this.structuralRejections < MAX_STRUCTURAL_REJECTIONS) return

    this.outboundHalted = true
    this.clearSendQueue()
    console.error(
      `[NodeStoreSync] Pausing outbound sync after ${this.structuralRejections} consecutive ` +
        `"${code}" rejections. Local changes are valid but the hub keeps rejecting them — this ` +
        `usually means the hub is on an incompatible @xnetjs/sync build (protocol/hash skew). ` +
        `Outbound sync resumes on reconnect. Hub said: ${
          message.error ?? message.message ?? '(no detail)'
        }`
    )
  }

  /**
   * Halt outbound sync on a capacity rejection (exploration 0291). Unlike the
   * structural breaker, one rejection is enough: while the account is over
   * quota (or the hub's disk is full) every further change is rejected too, so
   * resending only floods the hub. Local data is untouched — the store keeps
   * accepting writes and the un-pushed changes replay on the next reconnect
   * (the demo hub's daily reset / freed disk clears the condition server-side).
   */
  private recordCapacityRejection(
    reason: SyncBlockedReason,
    message: Record<string, unknown>
  ): void {
    const detail = String(message.error ?? message.message ?? '')
    if (!this.outboundHalted) {
      this.outboundHalted = true
      this.clearSendQueue()
      console.error(
        reason === 'QUOTA_EXCEEDED'
          ? `[NodeStoreSync] Hub storage limit reached — pausing outbound sync. Your data is safe ` +
              `locally; syncing resumes when space frees up (demo hubs reset daily). Hub said: ${detail}`
          : `[NodeStoreSync] Hub disk is full — pausing outbound sync. Your data is safe locally; ` +
              `syncing resumes automatically. Hub said: ${detail}`
      )
    }
    for (const listener of this.syncBlockedListeners) {
      try {
        listener(reason, detail)
      } catch (err) {
        console.error('Error in sync-blocked listener:', err)
      }
    }
  }

  /**
   * Subscribe to capacity-blocked events (hub over quota / disk full) so the
   * app can surface a "storage full" notice. Returns an unsubscribe function.
   */
  onSyncBlocked(listener: SyncBlockedListener): () => void {
    this.syncBlockedListeners.add(listener)
    return () => {
      this.syncBlockedListeners.delete(listener)
    }
  }

  private requestSync(): void {
    if (!this.connection) return
    this.connection.sendRaw({
      type: 'node-sync-request',
      room: this.room,
      sinceLamport: this.lastSyncedLamport
    })
  }

  private async handleRemoteChange(
    serialized: SerializedNodeChange,
    peerId: string = 'unknown'
  ): Promise<void> {
    const change = this.deserializeChange(serialized)

    // Share rooms cursor on a per-room seq (advanced only from sync-response
    // high-water marks), so a live broadcast's author lamport must not move it.
    if (!this.subscribeOnly && serialized.lamportTime > this.lastSyncedLamport) {
      this.lastSyncedLamport = serialized.lamportTime
    }

    // Check if this is a known change type
    if (!KNOWN_CHANGE_TYPES.has(change.type)) {
      // Unknown change type - emit event but don't process
      // The change is still stored in the change log for forward compatibility
      // when the store's appendChange is called with raw changes
      console.warn(
        `Received unknown change type "${change.type}" from peer ${peerId}. ` +
          'Change stored but not processed (forward compatibility).'
      )
      this.emitUnknownChangeType(change, peerId)
      return
    }

    try {
      this.markFirstRemoteApply()
      await this.store.applyRemoteChange(change)
    } catch (err) {
      // One bad relayed change must not become an unhandled rejection (0206).
      console.warn(
        `[NodeStoreSync] skipping un-appliable remote change for node ${change.payload?.nodeId}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  private async handleSyncResponse(
    response: NodeSyncResponse,
    peerId: string = 'hub'
  ): Promise<void> {
    if (response.changes.length > 0) {
      const allChanges = response.changes.map((s) => this.deserializeChange(s))

      // Separate known and unknown change types
      const knownChanges: NodeChange[] = []
      for (const change of allChanges) {
        if (KNOWN_CHANGE_TYPES.has(change.type)) {
          knownChanges.push(change)
        } else {
          // Unknown change type - emit event but don't process
          console.warn(
            `Received unknown change type "${change.type}" from ${peerId}. ` +
              'Change stored but not processed (forward compatibility).'
          )
          this.emitUnknownChangeType(change, peerId)
        }
      }

      if (knownChanges.length > 0) {
        this.markFirstRemoteApply()
        await this.store.applyRemoteChanges(knownChanges)
      }
    }

    // Rollback guard (exploration 0254; scoped in 0260): a hub high-water mark
    // BELOW our confirmed cursor can mean the hub lost history it once held (e.g. a
    // Litestream/R2 point-in-time restore). For a genuine PARTIAL rollback we drop
    // the in-memory push cursor to the hub's real mark and re-offer the gap now,
    // in-session, before `ensureCursorLoaded` restores it on the next reconnect.
    //
    // But two cases must NOT trigger a re-offer, because it would re-push the whole
    // log for nothing (exploration 0260 caught this flooding the cold-open):
    //   - `highWaterMark === 0` — a fresh/empty/reset hub, not a recoverable
    //     rollback; re-offering `getChangesSince(0)` dumps the entire 318k-row log.
    //   - `outboundHalted` — the INVALID_HASH breaker has tripped (0224 protocol
    //     skew), so every re-offered change is rejected identically; flooding is futile.
    // The persisted cursor is monotonic (anti-replay) and stays put; change-log
    // compaction stays safe regardless because it retains every row backing a live
    // value, so those rows remain available to re-push if a real rollback occurs.
    if (
      response.highWaterMark > 0 &&
      !this.outboundHalted &&
      response.highWaterMark < this.lastSyncedLamport &&
      this.pushedThrough > response.highWaterMark
    ) {
      console.warn(
        `[NodeStoreSync] hub high-water mark ${response.highWaterMark} is below ` +
          `the confirmed cursor ${this.lastSyncedLamport} (hub rollback?); ` +
          're-offering local changes'
      )
      this.pushedThrough = response.highWaterMark
      void this.syncLocalChanges()
    }

    // The hub's high-water mark is the only positive confirmation that the hub
    // durably holds changes up to this point. Advance and PERSIST the cursor
    // from it (not from local sends) so a reload never replays already-synced
    // history (exploration 0206).
    if (response.highWaterMark > this.lastSyncedLamport) {
      this.lastSyncedLamport = response.highWaterMark
      this.pushedThrough = Math.max(this.pushedThrough, this.lastSyncedLamport)
      // Forward progress from the hub: clear any accumulated structural-rejection
      // count so a stray one-off rejection in a healthy session never trips the
      // breaker. (A tripped breaker only clears on reconnect.)
      this.structuralRejections = 0
      try {
        await this.store.setSyncCursor(this.room, this.lastSyncedLamport)
      } catch (err) {
        console.warn('[NodeStoreSync] failed to persist sync cursor:', err)
      }
    }

    this.resolveSyncResponse()
  }

  // ─── Outbound (throttled) ────────────────────────────────────────────────

  /** Enqueue every local change since the last confirmed send, then drain. */
  private async syncLocalChanges(): Promise<void> {
    if (this.outboundHalted) return
    if (!this.connection || this.connection.status !== 'connected') return

    // On a first/reconnect sync whose persisted cursor lags far behind the local
    // log (e.g. the hub never confirmed the tail — INVALID_HASH skew, 0224), this
    // slice can be tens of thousands of rows, and everything below runs on the main
    // thread right after the sync-response resolves. That was the single ~5s
    // uninterrupted `window` long task in the cold-open (exploration 0253):
    //   - `getChangesSince` itself deserializes (JSON.parse per row) synchronously;
    //     `fetchMs` below measures that residual block (bounded durably by
    //     compacting the change log so the slice is small — F3).
    //   - use CODE-UNIT order, not `localeCompare`, for the author tie-break — the
    //     query already returns lamport-ASC order, so this only breaks ties, and
    //     `localeCompare` over a large tie-heavy array is orders of magnitude slower
    //     AND violates the repo's code-unit collation invariant (the inbound apply
    //     path already orders by code units).
    //   - yield to the event loop every N so the enqueue never monopolises a frame.
    const t0 = nowMs()
    const changes = await this.store.getChangesSince(this.pushedThrough)
    if (changes.length === 0) return
    const fetchMs = nowMs() - t0

    changes.sort(
      (a, b) =>
        a.lamport - b.lamport ||
        (a.authorDID < b.authorDID ? -1 : a.authorDID > b.authorDID ? 1 : 0)
    )
    const sortMs = nowMs() - t0 - fetchMs

    for (let i = 0; i < changes.length; i++) {
      this.enqueueChange(changes[i])
      if ((i + 1) % OUTBOUND_ENQUEUE_BATCH === 0 && i + 1 < changes.length) {
        // Bail if the connection dropped while we were yielding.
        if (this.outboundHalted || this.connection?.status !== 'connected') return
        await yieldToEventLoop()
      }
    }

    // Self-gating: only speak up when the resync was actually heavy, so a cold
    // capture names the residual main-thread cost (and confirms the fix landed)
    // without adding steady-state noise. See exploration 0253 / F3 (compaction).
    if (changes.length >= HEAVY_RESYNC_CHANGES || fetchMs + sortMs >= HEAVY_RESYNC_MS) {
      console.warn(
        `[NodeStoreSync] heavy outbound resync: ${changes.length} changes, ` +
          `fetch+deserialize ${Math.round(fetchMs)}ms, sort ${Math.round(sortMs)}ms ` +
          `(cursor ${this.pushedThrough})`
      )
    }
  }

  /** Queue a change for throttled broadcast (deduped by hash). */
  private enqueueChange(change: NodeChange): void {
    if (this.outboundHalted) return
    if (this.shouldPublish && !this.shouldPublish(change)) return
    if (change.lamport <= this.pushedThrough) return
    if (this.queuedHashes.has(change.hash)) return
    this.queuedHashes.add(change.hash)
    this.sendQueue.push(change)
    this.scheduleDrain(0)
  }

  private scheduleDrain(delayMs: number): void {
    if (this.sendTimer) return
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      this.drain()
    }, delayMs)
  }

  private drain(): void {
    if (this.outboundHalted) return
    if (!this.connection || this.connection.status !== 'connected') return

    this.sentInWindow = 0
    while (this.sendQueue.length > 0 && this.sentInWindow < MAX_SENDS_PER_WINDOW) {
      const change = this.sendQueue.shift()!
      this.queuedHashes.delete(change.hash)
      this.publishChange(change)
      this.sentInWindow += 1
    }

    // More queued than this window allows → drain the rest after the window.
    if (this.sendQueue.length > 0) {
      this.scheduleDrain(SEND_WINDOW_MS)
    }
  }

  private publishChange(change: NodeChange): void {
    if (!this.connection) return
    this.connection.publish(this.room, {
      type: 'node-change',
      room: this.room,
      change: this.serializeChange(change)
    })
    // Optimistic in-memory advance — keeps us from re-sending within a session.
    // The PERSISTED cursor only advances on the hub's high-water mark.
    this.pushedThrough = Math.max(this.pushedThrough, change.lamport)
  }

  private clearSendQueue(): void {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer)
      this.sendTimer = null
    }
    this.sendQueue = []
    this.queuedHashes.clear()
    this.sentInWindow = 0
  }

  private serializeChange(change: NodeChange): SerializedNodeChange {
    return {
      id: change.id,
      type: change.type,
      hash: change.hash,
      room: this.room,
      nodeId: change.payload.nodeId,
      schemaId: change.payload.schemaId,
      lamportTime: change.lamport,
      lamportAuthor: change.authorDID,
      authorDid: change.authorDID,
      wallTime: change.wallTime,
      parentHash: change.parentHash,
      payload: change.payload,
      signatureB64: bytesToBase64(change.signature),
      // protocolVersion is part of the hashed fields — dropping it makes
      // every relayed change fail verifyChangeHash on the receiving side
      protocolVersion: change.protocolVersion,
      batchId: change.batchId,
      batchIndex: change.batchIndex,
      batchSize: change.batchSize
    }
  }

  private deserializeChange(serialized: SerializedNodeChange): NodeChange {
    // schemaId is carried both in the payload and (redundantly) at the top
    // level. If the payload's is missing, fall back to the top-level field so a
    // first change still materializes instead of throwing "must include
    // schemaId" and aborting the batch (exploration 0206).
    const payload =
      serialized.payload && !serialized.payload.schemaId && serialized.schemaId
        ? { ...serialized.payload, schemaId: serialized.schemaId as NodePayload['schemaId'] }
        : serialized.payload
    return {
      id: serialized.id,
      type: serialized.type,
      hash: serialized.hash as ContentId,
      parentHash: serialized.parentHash as ContentId | null,
      authorDID: serialized.authorDid as DID,
      signature: base64ToBytes(serialized.signatureB64),
      wallTime: serialized.wallTime,
      lamport: serialized.lamportTime,
      payload,
      protocolVersion: serialized.protocolVersion,
      batchId: serialized.batchId,
      batchIndex: serialized.batchIndex,
      batchSize: serialized.batchSize
    }
  }
}
