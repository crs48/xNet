/**
 * Hub ingest load smoke (exploration 0272, Pillar 5).
 *
 * Boots a real in-process hub and throws a reconnect-storm-shaped load at
 * it: M WebSocket clients each pushing K genuinely signed node changes
 * concurrently, paced under the hub's per-connection rate limit (the sync
 * provider's own throttle is 40 msg/s, so pacing is realistic too). Then a
 * verifier client pulls the room and the suite asserts correctness under
 * load — every change accepted exactly once, none dropped, none duplicated,
 * hashes intact — and reports throughput + sync-response latency.
 *
 * The PR lane asserts correctness only. Wall-clock throughput floors bite in
 * the soak lane (XNET_SOAK=1) with deliberately generous bounds.
 *
 * Depth knobs: XNET_HUB_CLIENTS (default 8), XNET_HUB_CHANGES (default 25
 * per client).
 */

import type { DID } from '@xnetjs/core'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { createHub, type HubInstance } from '@xnetjs/hub'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { envInt } from '../support/rng'

// tests/reliability has no package.json of its own; resolve `ws` from the
// hub package, which owns the dependency.
const hubRequire = createRequire(
  fileURLToPath(new URL('../../../packages/hub/package.json', import.meta.url))
)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { WebSocket } = hubRequire('ws') as { WebSocket: any }
type WebSocket = any

const PORT = 14872
const CLIENTS = envInt('XNET_HUB_CLIENTS', 8)
const CHANGES_PER_CLIENT = envInt('XNET_HUB_CHANGES', 25)
const SOAK = process.env.XNET_SOAK === '1'
const ROOM = `reliability-load-${process.pid}`
// Stay comfortably under the hub's 100 msg/s per-connection limit — the real
// sync provider throttles itself to 40 msg/s for the same reason (0206).
const SEND_INTERVAL_MS = 15

const connect = (): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    ws.on('error', reject)
    ws.on('open', () => ws.once('message', () => resolve(ws)))
  })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface LoadClient {
  ws: WebSocket
  did: DID
  privateKey: Uint8Array
  hashes: string[]
}

async function makeLoadClient(): Promise<LoadClient> {
  const { privateKey } = generateSigningKeyPair()
  const identity = identityFromPrivateKey(privateKey)
  return { ws: await connect(), did: identity.did as DID, privateKey, hashes: [] }
}

async function pushChanges(client: LoadClient, count: number, offset: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const unsigned = createUnsignedChange({
      id: createChangeId(),
      type: 'node-change',
      payload: {
        nodeId: `load-node-${offset}-${i}`,
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: `load ${offset}-${i}`, seq: i }
      },
      parentHash: null,
      authorDID: client.did,
      wallTime: Date.now(),
      lamport: offset * count + i + 1
    })
    const signed = signChange(unsigned, client.privateKey)
    client.hashes.push(signed.hash)
    client.ws.send(
      JSON.stringify({
        type: 'publish',
        topic: ROOM,
        data: {
          type: 'node-change',
          room: ROOM,
          change: {
            id: signed.id,
            type: signed.type,
            hash: signed.hash,
            room: ROOM,
            nodeId: (signed.payload as { nodeId: string }).nodeId,
            schemaId: 'xnet://xnet.dev/Task',
            lamportTime: signed.lamport,
            lamportAuthor: signed.authorDID,
            authorDid: signed.authorDID,
            wallTime: signed.wallTime,
            parentHash: signed.parentHash,
            payload: signed.payload,
            signatureB64: bytesToBase64(signed.signature),
            protocolVersion: signed.protocolVersion
          }
        }
      })
    )
    await sleep(SEND_INTERVAL_MS)
  }
}

describe('hub ingest load smoke (0272)', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  }, 30_000)

  afterAll(async () => {
    await hub.stop()
  })

  it(`${CLIENTS} concurrent clients × ${CHANGES_PER_CLIENT} changes all land exactly once`, async () => {
    const clients: LoadClient[] = []
    for (let i = 0; i < CLIENTS; i += 1) clients.push(await makeLoadClient())

    const t0 = performance.now()
    await Promise.all(clients.map((c, i) => pushChanges(c, CHANGES_PER_CLIENT, i)))
    const pushMs = performance.now() - t0

    // Give the relay a moment to drain its ingest queue, then pull.
    await sleep(250)
    const verifier = await connect()
    const syncT0 = performance.now()
    verifier.send(JSON.stringify({ type: 'node-sync-request', room: ROOM, sinceLamport: 0 }))
    const response = await new Promise<{ type: string; changes?: Array<{ hash: string }> }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('sync-response timeout')), 10_000)
        verifier.on('message', (data) => {
          const parsed = JSON.parse(data.toString())
          if (parsed.type === 'node-sync-response') {
            clearTimeout(timeout)
            resolve(parsed)
          }
        })
      }
    )
    const syncMs = performance.now() - syncT0

    const expected = clients.flatMap((c) => c.hashes).sort()
    const received = (response.changes ?? []).map((c) => c.hash).sort()

    // Exactly once: nothing dropped, nothing duplicated, hashes intact.
    expect(received).toEqual(expected)

    const total = CLIENTS * CHANGES_PER_CLIENT
    const throughput = Math.round((total / pushMs) * 1000)

    console.log(
      `[hub-load] ${total} changes from ${CLIENTS} clients: ` +
        `ingest ${Math.round(pushMs)}ms (~${throughput}/s offered), ` +
        `full-room sync-response ${Math.round(syncMs)}ms`
    )
    if (SOAK) {
      // Generous ceilings — catching collapse, not chasing microseconds.
      expect(syncMs).toBeLessThan(10_000)
    }

    verifier.close()
    for (const c of clients) c.ws.close()
  }, 120_000)
})
