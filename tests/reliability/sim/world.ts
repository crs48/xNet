/**
 * Deterministic sync simulation (exploration 0272, Pillar 2).
 *
 * A SimWorld runs N clients against one relay over a virtual network whose
 * every decision — which message to deliver next, whether to drop, duplicate,
 * partition, or crash — comes from a single seeded PRNG. Given the same seed
 * (plus a pinned Date, see the test file) a run is fully reproducible, so any
 * invariant violation replays exactly from the seed in the failure message.
 *
 * Fidelity choices, deliberately:
 * - Clients are REAL `NodeStore`s over the REAL SQL LWW path
 *   (`SQLiteNodeStorageAdapter` over the in-memory sql.js adapter), not
 *   model reimplementations. The adapter object plays the role of the disk:
 *   it survives a crash; the NodeStore (process state, Lamport clock in RAM)
 *   is rebuilt via `initialize()`, exactly like an app relaunch.
 * - The relay mirrors the hub's node-relay semantics that matter for
 *   convergence: verify the change hash on ingest, dedup by hash, answer
 *   sync requests with "changes with lamport > cursor" plus a high-water
 *   mark (packages/hub/src/services/node-relay.ts). Transport-level truth
 *   stays with the sync-matrix e2e suite.
 * - Reconnect follows the client protocol shape from
 *   packages/runtime/src/sync/node-store-sync-provider.ts: request-sync-first
 *   from the persisted cursor, then push local-authored changes (the relay's
 *   dedup makes re-pushing idempotent).
 */

import type { DID } from '@xnetjs/core'
import type { NodeChange, NodeState } from '@xnetjs/data'
import { NodeStore, SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { verifyChangeHash } from '@xnetjs/sync'
import { SimRng } from '../support/rng'

const SIM_ROOM = 'sim-room'
const SCHEMA_ID = 'xnet://xnet.fyi/Task'
const NODE_IDS = ['sim-node-0', 'sim-node-1', 'sim-node-2'] as const
const PROPERTY_KEYS = ['title', 'status', 'count'] as const

type SimMessage =
  | { seq: number; kind: 'push'; from: number; changes: NodeChange[] }
  | { seq: number; kind: 'deliver'; to: number; changes: NodeChange[] }
  | { seq: number; kind: 'sync-request'; from: number; since: number }
  | { seq: number; kind: 'sync-response'; to: number; changes: NodeChange[]; highWater: number }

interface SimClient {
  index: number
  did: DID
  privateKey: Uint8Array
  /** The "disk": survives crashes, owns cursors and the local change log. */
  storage: SQLiteNodeStorageAdapter
  /** The "process": rebuilt from storage on crash-restart. */
  store: NodeStore
  connected: boolean
  /** Every cursor value ever persisted, for the monotonicity invariant. */
  cursorHistory: number[]
}

/** Relay = the convergence-relevant core of the hub's node relay. */
class SimRelay {
  readonly byHash = new Map<string, NodeChange>()
  readonly log: NodeChange[] = []
  accepted = 0
  duplicates = 0
  rejectedInvalid = 0

  ingest(change: NodeChange): boolean {
    if (!verifyChangeHash(change)) {
      this.rejectedInvalid += 1
      return false
    }
    if (this.byHash.has(change.hash)) {
      this.duplicates += 1
      return false
    }
    this.byHash.set(change.hash, change)
    this.log.push(change)
    this.accepted += 1
    return true
  }

  changesSince(lamport: number): NodeChange[] {
    return this.log.filter((c) => c.lamport > lamport).sort((a, b) => a.lamport - b.lamport)
  }

  highWater(): number {
    let max = 0
    for (const c of this.log) if (c.lamport > max) max = c.lamport
    return max
  }
}

export interface SimResult {
  seed: number
  ops: number
  /** Deterministic event trace (no hashes/ids/wall times) for replay checks. */
  trace: string[]
  /** node id -> materialized properties, per client, after the final drain. */
  finalStates: Array<Record<string, Record<string, unknown> | null>>
  /** Reference state: a fresh store fed the relay's full log. */
  referenceState: Record<string, Record<string, unknown> | null>
  /** Same log applied twice — must equal referenceState (idempotency). */
  doubleApplyState: Record<string, Record<string, unknown> | null>
  cursorHistories: number[][]
  /** The relay's full accepted log, for post-mortem debugging of a failed seed. */
  relayLog: NodeChange[]
  relay: { accepted: number; duplicates: number; rejectedInvalid: number; logSize: number }
  faults: { drops: number; duplicates: number; crashes: number; partitions: number }
}

async function makeClient(index: number, rng: SimRng): Promise<SimClient> {
  const privateKey = rng.bytes32()
  const identity = identityFromPrivateKey(privateKey)
  const db = await createMemorySQLiteAdapter()
  const storage = new SQLiteNodeStorageAdapter(db)
  const store = new NodeStore({
    storage,
    authorDID: identity.did as DID,
    signingKey: privateKey
  })
  await store.initialize()
  return {
    index,
    did: identity.did as DID,
    privateKey,
    storage,
    store,
    connected: true,
    cursorHistory: []
  }
}

export async function runSimulation(seed: number, ops: number): Promise<SimResult> {
  const rng = new SimRng(seed)
  const relay = new SimRelay()
  const trace: string[] = []
  const queue: SimMessage[] = []
  const faults = { drops: 0, duplicates: 0, crashes: 0, partitions: 0 }
  let seq = 0

  const clientCount = 3
  const clients: SimClient[] = []
  for (let i = 0; i < clientCount; i += 1) clients.push(await makeClient(i, rng))

  const enqueue = (message: Omit<SimMessage, 'seq'>): void => {
    seq += 1
    queue.push({ ...message, seq } as SimMessage)
  }

  const purgeMessagesFor = (index: number): void => {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      const m = queue[i]
      const involves = ('from' in m && m.from === index) || ('to' in m && m.to === index)
      if (involves) queue.splice(i, 1)
    }
  }

  const localAuthoredChanges = async (client: SimClient): Promise<NodeChange[]> => {
    const all = await client.storage.getAllChanges()
    return all.filter((c) => c.authorDID === client.did)
  }

  /** Request-sync-first + push-all, the reconnect shape from 0206. */
  const reconnectFlush = async (client: SimClient): Promise<void> => {
    const cursor = await client.storage.getSyncCursor(SIM_ROOM)
    enqueue({ kind: 'sync-request', from: client.index, since: cursor })
    const local = await localAuthoredChanges(client)
    if (local.length > 0) enqueue({ kind: 'push', from: client.index, changes: local })
  }

  const applyToClient = async (client: SimClient, changes: NodeChange[]): Promise<void> => {
    await client.store.applyRemoteChanges(changes.slice())
  }

  const handleMessage = async (message: SimMessage): Promise<void> => {
    switch (message.kind) {
      case 'push': {
        const fresh = message.changes.filter((c) => relay.ingest(c))
        if (fresh.length > 0) {
          for (const other of clients) {
            if (other.index === message.from || !other.connected) continue
            enqueue({ kind: 'deliver', to: other.index, changes: fresh })
          }
        }
        break
      }
      case 'deliver': {
        await applyToClient(clients[message.to], message.changes)
        break
      }
      case 'sync-request': {
        enqueue({
          kind: 'sync-response',
          to: message.from,
          changes: relay.changesSince(message.since),
          highWater: relay.highWater()
        })
        break
      }
      case 'sync-response': {
        const client = clients[message.to]
        await applyToClient(client, message.changes)
        await client.storage.setSyncCursor(SIM_ROOM, message.highWater)
        client.cursorHistory.push(message.highWater)
        break
      }
    }
  }

  /** Deliver one random queued message, subject to fault rolls. */
  const deliverOne = async (allowFaults: boolean): Promise<void> => {
    if (queue.length === 0) return
    const index = rng.int(queue.length)
    const [message] = queue.splice(index, 1)

    const endpoint = 'from' in message ? clients[message.from] : clients[message.to]
    if (!endpoint.connected) {
      // The connection died while the packet was in flight.
      faults.drops += 1
      trace.push(`net:dead-endpoint ${message.kind}#${message.seq}`)
      return
    }
    if (allowFaults && rng.chance(0.08)) {
      faults.drops += 1
      trace.push(`net:drop ${message.kind}#${message.seq}`)
      return
    }
    if (allowFaults && rng.chance(0.06)) {
      faults.duplicates += 1
      queue.push(message) // will be picked (and handled) again later
      trace.push(`net:dup ${message.kind}#${message.seq}`)
    }
    trace.push(`net:deliver ${message.kind}#${message.seq}`)
    await handleMessage(message)
  }

  const writeSomething = async (client: SimClient): Promise<void> => {
    const nodeId = rng.pick(NODE_IDS)
    const key = rng.pick(PROPERTY_KEYS)
    const value = rng.int(1000)
    trace.push(`op:write c${client.index} ${nodeId} ${key}=${value}`)

    const before = await client.storage.getLastLamportTime()
    const existing = await client.store.get(nodeId)
    if (existing) {
      await client.store.update(nodeId, { properties: { [key]: value } })
    } else {
      await client.store.create({
        id: nodeId,
        schemaId: SCHEMA_ID,
        properties: { [key]: value }
      })
    }
    if (client.connected) {
      const all = await client.storage.getChangesSince(before)
      const fresh = all.filter((c) => c.authorDID === client.did)
      if (fresh.length > 0) enqueue({ kind: 'push', from: client.index, changes: fresh })
    }
  }

  const crashRestart = async (client: SimClient): Promise<void> => {
    trace.push(`op:crash c${client.index}`)
    faults.crashes += 1
    purgeMessagesFor(client.index) // in-flight packets die with the socket
    client.store = new NodeStore({
      storage: client.storage,
      authorDID: client.did,
      signingKey: client.privateKey
    })
    await client.store.initialize()
    if (client.connected) await reconnectFlush(client)
  }

  // ── Main schedule ─────────────────────────────────────────────────────────
  for (let op = 0; op < ops; op += 1) {
    const action = rng.weighted({
      write: 6,
      deliver: 10,
      crash: 1,
      partition: 1,
      heal: 2
    })
    switch (action) {
      case 'write':
        await writeSomething(rng.pick(clients))
        break
      case 'deliver':
        await deliverOne(true)
        break
      case 'crash':
        await crashRestart(rng.pick(clients))
        break
      case 'partition': {
        const connected = clients.filter((c) => c.connected)
        if (connected.length > 1) {
          const victim = rng.pick(connected)
          victim.connected = false
          faults.partitions += 1
          purgeMessagesFor(victim.index)
          trace.push(`op:partition c${victim.index}`)
        }
        break
      }
      case 'heal': {
        const cut = clients.filter((c) => !c.connected)
        if (cut.length > 0) {
          const healed = rng.pick(cut)
          healed.connected = true
          trace.push(`op:heal c${healed.index}`)
          await reconnectFlush(healed)
        }
        break
      }
    }
  }

  // ── Quiesce: heal everyone, drain, and run one anti-entropy round ────────
  trace.push('phase:drain')
  for (const client of clients) {
    if (!client.connected) {
      client.connected = true
      await reconnectFlush(client)
    }
  }
  while (queue.length > 0) await deliverOne(false)
  // Everyone pushes anything the relay might still miss…
  for (const client of clients) {
    const local = await localAuthoredChanges(client)
    if (local.length > 0) enqueue({ kind: 'push', from: client.index, changes: local })
  }
  while (queue.length > 0) await deliverOne(false)
  // …then everyone pulls the relay's complete log.
  for (const client of clients) {
    enqueue({ kind: 'sync-request', from: client.index, since: 0 })
  }
  while (queue.length > 0) await deliverOne(false)

  // ── Materialize final states ──────────────────────────────────────────────
  const snapshot = async (
    read: (id: string) => Promise<NodeState | null>
  ): Promise<Record<string, Record<string, unknown> | null>> => {
    const out: Record<string, Record<string, unknown> | null> = {}
    for (const id of NODE_IDS) {
      const node = await read(id)
      out[id] = node ? { ...node.properties, __deleted: node.deleted } : null
    }
    return out
  }

  const finalStates: SimResult['finalStates'] = []
  for (const client of clients) {
    finalStates.push(await snapshot((id) => client.store.get(id)))
  }

  // Reference replica: a store that never saw the chaos, fed the full log once…
  const reference = await makeClient(97, new SimRng(seed ^ 0x5eed))
  await reference.store.applyRemoteChanges(relay.log.slice())
  const referenceState = await snapshot((id) => reference.store.get(id))
  // …and then the full log AGAIN (double apply must be a no-op).
  await reference.store.applyRemoteChanges(relay.log.slice())
  const doubleApplyState = await snapshot((id) => reference.store.get(id))

  const result: SimResult = {
    seed,
    ops,
    trace,
    finalStates,
    referenceState,
    doubleApplyState,
    cursorHistories: clients.map((c) => c.cursorHistory),
    relayLog: relay.log.slice(),
    relay: {
      accepted: relay.accepted,
      duplicates: relay.duplicates,
      rejectedInvalid: relay.rejectedInvalid,
      logSize: relay.log.length
    },
    faults
  }

  await reference.storage.close()
  for (const client of clients) await client.storage.close()
  return result
}
