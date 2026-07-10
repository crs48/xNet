/**
 * Demo-mode storage guardrails (exploration 0291).
 *
 * These are the integration tests that were missing: the per-user quota and
 * the daily reset are exercised against REAL storage + the real relay, not a
 * mock. That gap is why the demo hub silently grew past its 500 MB volume.
 */
import type { AuthContext } from '../src/auth/ucan'
import type { HubStorage, SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { afterEach, describe, expect, it } from 'vitest'
import { DiskWatchdog } from '../src/services/disk-watchdog'
import { NodeRelayError, NodeRelayService } from '../src/services/node-relay'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'

const ROOM = 'demo-room'

// A stable software identity so every change is attributed to one DID and the
// per-user cap actually accumulates.
const { privateKey } = generateSigningKeyPair()
const identity = identityFromPrivateKey(privateKey)

const makeSignedChange = (nodeId: string, lamport: number): SerializedNodeChange => {
  const payload = {
    nodeId,
    schemaId: 'xnet://xnet.dev/Task',
    properties: { title: `Task ${nodeId}`, status: 'todo' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: identity.did as DID,
    wallTime: 1_700_000_000_000 + lamport,
    lamport
  })
  const signed = signChange(unsigned, privateKey)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId,
    schemaId: payload.schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion,
    batchId: signed.batchId,
    batchIndex: signed.batchIndex,
    batchSize: signed.batchSize
  }
}

const usageOf = (change: SerializedNodeChange): number =>
  JSON.stringify(change.payload).length + change.signatureB64.length

// `handleNodeChange` only reads `.did` and `.can(...)`.
const allowAuth = { did: identity.did, can: () => true } as unknown as AuthContext

const relayMsg = (change: SerializedNodeChange) =>
  ({ type: 'node-change', room: ROOM, change }) as const

// ─── Storage: per-DID usage + reset (both backends) ─────────────────────────

let sqliteAvailable = false
try {
  const probe = mkdtempSync(join(tmpdir(), 'hub-probe-'))
  createSQLiteStorage(probe).close()
  rmSync(probe, { recursive: true, force: true })
  sqliteAvailable = true
} catch {
  sqliteAvailable = false
}

type Factory = { name: string; create: () => { storage: HubStorage; cleanup: () => void } }
const factories: Factory[] = [
  { name: 'Memory', create: () => ({ storage: createMemoryStorage(), cleanup: () => {} }) },
  ...(sqliteAvailable
    ? [
        {
          name: 'SQLite',
          create: () => {
            const dir = mkdtempSync(join(tmpdir(), 'hub-demo-'))
            return {
              storage: createSQLiteStorage(dir),
              cleanup: () => rmSync(dir, { recursive: true, force: true })
            }
          }
        }
      ]
    : [])
]

describe.each(factories)('demo storage accounting ($name)', ({ create }) => {
  let storage: HubStorage
  let cleanup: () => void
  afterEach(async () => {
    await storage.close?.()
    cleanup()
  })

  it('getUsageBytesByDid sums a DID change bytes and ignores others', async () => {
    ;({ storage, cleanup } = create())
    const c1 = makeSignedChange('node-1', 1)
    const c2 = makeSignedChange('node-2', 2)
    await storage.appendNodeChange(ROOM, c1)
    await storage.appendNodeChange(ROOM, c2)

    const used = await storage.getUsageBytesByDid(identity.did)
    expect(used).toBe(usageOf(c1) + usageOf(c2))
    expect(await storage.getUsageBytesByDid('did:key:zNobody')).toBe(0)
  })

  it('resetAllUserData wipes user content and returns counts', async () => {
    ;({ storage, cleanup } = create())
    await storage.appendNodeChange(ROOM, makeSignedChange('node-1', 1))
    await storage.appendNodeChange(ROOM, makeSignedChange('node-2', 2))
    await storage.setDocState('doc-1', new Uint8Array([1, 2, 3]))

    const result = await storage.resetAllUserData()
    expect(result.nodeChanges).toBe(2)
    expect(result.docStates).toBe(1)

    expect(await storage.getUsageBytesByDid(identity.did)).toBe(0)
    expect(await storage.getNodeChangesSince(ROOM, 0)).toHaveLength(0)
    expect(await storage.getDocState('doc-1')).toBeNull()
  })
})

// ─── Relay: quota + storage-full enforcement ────────────────────────────────

describe('node relay demo enforcement', () => {
  it('rejects a change that would exceed the per-user quota', async () => {
    const storage = createMemoryStorage()
    const first = makeSignedChange('node-1', 1)
    // Budget exactly one change: the second (same-size) change must exceed it.
    const relay = new NodeRelayService(storage, {}, { quotaBytes: usageOf(first) })

    await expect(relay.handleNodeChange(relayMsg(first), allowAuth)).resolves.toBe(true)

    const second = makeSignedChange('node-2', 2)
    await expect(relay.handleNodeChange(relayMsg(second), allowAuth)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED'
    })
    // The rejected change was not stored.
    expect(await storage.hasNodeChange(second.hash)).toBe(false)
  })

  it('allows unbounded writes when no quota is configured (self-host default)', async () => {
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage, {}, {})
    for (let i = 0; i < 5; i++) {
      await expect(
        relay.handleNodeChange(relayMsg(makeSignedChange(`node-${i}`, i + 1)), allowAuth)
      ).resolves.toBe(true)
    }
  })

  it('sheds writes with STORAGE_FULL when the disk is full', async () => {
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage, {}, { isStorageFull: () => true })
    await expect(
      relay.handleNodeChange(relayMsg(makeSignedChange('node-1', 1)), allowAuth)
    ).rejects.toBeInstanceOf(NodeRelayError)
    await expect(
      relay.handleNodeChange(relayMsg(makeSignedChange('node-1', 1)), allowAuth)
    ).rejects.toMatchObject({ code: 'STORAGE_FULL' })
  })
})

// ─── Disk watchdog ──────────────────────────────────────────────────────────

describe('DiskWatchdog', () => {
  const fsWith = (bytes: number) => ({
    readdir: () => ['hub.db'],
    stat: () => ({ isDirectory: () => false, isFile: () => true, size: bytes, mtimeMs: 1 })
  })

  it('flips isFull when usage crosses the threshold', () => {
    const wd = new DiskWatchdog({
      dataDir: '/data',
      maxBytes: 500 * 1024 * 1024,
      threshold: 0.9,
      fs: fsWith(600 * 1024 * 1024)
    })
    expect(wd.isFull()).toBe(false) // not sampled yet
    wd.sample()
    expect(wd.isFull()).toBe(true)
  })

  it('stays clear while under the threshold', () => {
    const wd = new DiskWatchdog({
      dataDir: '/data',
      maxBytes: 500 * 1024 * 1024,
      threshold: 0.9,
      fs: fsWith(100 * 1024 * 1024)
    })
    wd.sample()
    expect(wd.isFull()).toBe(false)
  })
})
