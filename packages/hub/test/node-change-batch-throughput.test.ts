/**
 * Bulk-push throughput (exploration 0357).
 *
 * The headline claim: pushing a large import used to be bounded by frames, not
 * by work. At one change per frame and the client's 40 msg/s outbound
 * throttle, 10,000 changes take ~250 s to transmit no matter how fast the hub
 * is. Batched frames remove that ceiling.
 *
 * This test measures the HUB side end-to-end — parse, verify signature, check
 * authorization, and store 10,000 real signed changes arriving as batch frames
 * — and asserts it completes well inside the 30 s budget from the exploration.
 * It is deliberately a floor, not a benchmark: it fails if batching regresses
 * to per-frame behaviour or if verification falls back to the slow path.
 */
import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnetjs/sync'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

const PORT = 14483
const ROOM = 'workspace-throughput'
const TOTAL_CHANGES = 10_000
const BATCH_SIZE = 1000
const BUDGET_MS = 30_000

const { privateKey } = generateSigningKeyPair()
const AUTHOR_DID = identityFromPrivateKey(privateKey).did as DID

const connect = (): Promise<WebSocket> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    ws.on('open', () => ws.once('message', () => resolve(ws)))
  })

const makeChange = (index: number): SerializedNodeChange => {
  const payload = {
    nodeId: `throughput-node-${index}`,
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: `Task ${index}`, status: 'todo', index }
  }
  const signed = signChange(
    createUnsignedChange({
      id: createChangeId(),
      type: 'node-change',
      payload,
      parentHash: null,
      authorDID: AUTHOR_DID,
      wallTime: Date.now(),
      lamport: index + 1
    }),
    privateKey
  )
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId: payload.nodeId,
    schemaId: payload.schemaId,
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

describe('bulk push throughput (0357)', () => {
  let hub: HubInstance

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: false,
      storage: 'memory',
      // Lift the per-connection budgets so this measures the hub's real
      // processing cost rather than the deliberate anti-abuse throttle.
      rateLimit: { perConnectionChangeRate: 1_000_000, perConnectionRate: 10_000 }
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it(
    `ingests ${TOTAL_CHANGES.toLocaleString()} changes via batch frames within ${BUDGET_MS / 1000}s`,
    async () => {
      const ws = await connect()
      const changes = Array.from({ length: TOTAL_CHANGES }, (_, index) => makeChange(index))

      const started = Date.now()
      for (let offset = 0; offset < changes.length; offset += BATCH_SIZE) {
        ws.send(
          JSON.stringify({
            type: 'publish',
            topic: ROOM,
            data: {
              type: 'node-change-batch',
              room: ROOM,
              changes: changes.slice(offset, offset + BATCH_SIZE)
            }
          })
        )
      }

      // Poll the hub until every change has landed (or the budget expires).
      const stored = await new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error(`did not ingest ${TOTAL_CHANGES} changes within budget`)),
          BUDGET_MS
        )
        const poll = (): void => {
          const onMessage = (data: Buffer): void => {
            const message = JSON.parse(data.toString()) as {
              type?: string
              highWaterMark?: number
            }
            if (message.type !== 'node-sync-response') return
            ws.off('message', onMessage)
            if ((message.highWaterMark ?? 0) >= TOTAL_CHANGES) {
              clearTimeout(deadline)
              resolve(message.highWaterMark ?? 0)
              return
            }
            setTimeout(poll, 100)
          }
          ws.on('message', onMessage)
          // Ask only for the tail: we want the high-water mark, not 10k rows.
          ws.send(
            JSON.stringify({
              type: 'node-sync-request',
              room: ROOM,
              sinceLamport: TOTAL_CHANGES - 1
            })
          )
        }
        poll()
      })

      const elapsedMs = Date.now() - started
      expect(stored).toBe(TOTAL_CHANGES)
      expect(elapsedMs).toBeLessThan(BUDGET_MS)

      const perSecond = Math.round(TOTAL_CHANGES / (elapsedMs / 1000))
      console.log(
        `[0357] ingested ${TOTAL_CHANGES} changes in ${elapsedMs}ms (${perSecond}/s) ` +
          `across ${TOTAL_CHANGES / BATCH_SIZE} batch frames`
      )

      ws.close()
    },
    BUDGET_MS + 30_000
  )
})
