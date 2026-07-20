/**
 * Hub-to-hub Space subscription (explorations 0258/0382/0383 W4).
 *
 * The literal hub-of-hubs test: hub B (gateway role) subscribes to a room on
 * hub A over A's ordinary wire protocol, mirrors A's nodes under /sub/*,
 * keeps mirroring after A restarts (reconnect → resubscribe → re-backfill),
 * and NEVER re-exports the mirror — plus the startup cycle guard.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'
import { resolveConfig } from '../src/config'
import type { SerializedNodeChange } from '../src/storage/interface'

const PORT_A = 14497
const PORT_B = 14498
const ROOM = 'xnet-space-public-demo'

const author = (() => {
  const { privateKey } = generateSigningKeyPair()
  return { privateKey, did: identityFromPrivateKey(privateKey).did as DID }
})()

const makeChange = (index: number, lamport: number): SerializedNodeChange => {
  const payload = {
    nodeId: `pub-node-${index}`,
    schemaId: 'xnet://xnet.fyi/Page@1.0.0',
    properties: { title: `Public page ${index}` }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: author.did,
    wallTime: Date.now(),
    lamport
  })
  const signed = signChange(unsigned, author.privateKey)
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

const startHubA = async (): Promise<HubInstance> => {
  const hub = await createHub(
    resolveConfig({
      port: PORT_A,
      auth: false,
      storage: 'memory',
      dataDir: mkdtempSync(join(tmpdir(), 'xnet-suba-'))
    })
  )
  await hub.start()
  return hub
}

const pushChange = (change: SerializedNodeChange): Promise<void> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT_A}`)
    const timer = setTimeout(() => reject(new Error('push timeout')), 3000)
    ws.on('open', () => {
      ws.send(
        JSON.stringify({ type: 'publish', topic: ROOM, data: { type: 'node-change', room: ROOM, change } })
      )
      // Give the relay a beat to persist before closing.
      setTimeout(() => {
        clearTimeout(timer)
        ws.close()
        resolve()
      }, 150)
    })
    ws.on('error', reject)
  })

const pollMirror = async (expected: number, timeoutMs = 6000): Promise<number> => {
  const deadline = Date.now() + timeoutMs
  let nodes = 0
  while (Date.now() < deadline) {
    const res = await fetch(`http://localhost:${PORT_B}/sub/status`).catch(() => null)
    if (res?.ok) {
      const body = (await res.json()) as { subscriptions: Array<{ nodes: number }> }
      nodes = body.subscriptions[0]?.nodes ?? 0
      if (nodes >= expected) return nodes
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return nodes
}

describe('hub-to-hub subscription (0383 W4)', () => {
  let hubA: HubInstance | null = null
  let hubB: HubInstance | null = null

  afterAll(async () => {
    await hubB?.stop()
    await hubA?.stop()
  })

  it('hub B mirrors hub A public room, survives A restart, never re-exports', async () => {
    hubA = await startHubA()
    await pushChange(makeChange(1, 1))
    await pushChange(makeChange(2, 2))

    hubB = await createHub(
      resolveConfig({
        port: PORT_B,
        auth: false,
        storage: 'memory',
        dataDir: mkdtempSync(join(tmpdir(), 'xnet-subb-')),
        role: 'gateway',
        subscriptions: {
          enabled: true,
          reconnectDelayMs: 100,
          peers: [{ id: 'peer-a', url: `ws://localhost:${PORT_A}`, room: ROOM }]
        }
      })
    )
    await hubB.start()

    // Backfill: both pre-existing changes arrive via node-sync-request.
    expect(await pollMirror(2)).toBe(2)
    const node = (await (
      await fetch(`http://localhost:${PORT_B}/sub/peer-a/node/pub-node-1`)
    ).json()) as { node: { properties: Record<string, unknown> } }
    expect(node.node.properties.title).toBe('Public page 1')

    // The no-transitive-re-export invariant: the mirror exists ONLY under
    // /sub/* — B's public read surface and rooms know nothing of it.
    expect((await fetch(`http://localhost:${PORT_B}/public/node/pub-node-1`)).status).toBe(404)

    // Restart A; B reconnects with backoff, resubscribes, and the live tail
    // resumes — the mirror grows past the restart.
    await hubA.stop()
    hubA = await startHubA()
    await new Promise((r) => setTimeout(r, 400)) // let B's reconnect land
    await pushChange(makeChange(3, 3))
    expect(await pollMirror(3)).toBe(3)
  }, 20_000)

  it('rejects a subscription pointing at the hub itself (cycle guard)', async () => {
    await expect(
      createHub(
        resolveConfig({
          port: 14499,
          auth: false,
          storage: 'memory',
          dataDir: mkdtempSync(join(tmpdir(), 'xnet-subc-')),
          subscriptions: {
            enabled: true,
            peers: [{ id: 'self', url: 'ws://localhost:14499', room: ROOM }]
          }
        })
      )
    ).rejects.toThrow(/subscribe to its own Space/)
  })
})
