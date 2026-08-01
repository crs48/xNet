/**
 * A recording must survive `.xnetpack` export/import intact (exploration
 * 0414): the track blobs, the transcript, and — the part that is easy to lose
 * — the cut list and chapters, which are the *edit* and exist nowhere else.
 *
 * Exporting a screencast without its cuts would hand back the unedited
 * original while claiming to be a portable copy, which is precisely the
 * "no egress fees" promise in CHARTER §6 failing quietly.
 */

import type { SchemaIRI } from '../schema/node'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair, sign, hashHex } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { applyBundle } from './apply'
import { MemoryBundleSink } from './memory-bundle'
import { type BundleBlobPort } from './types'
import { writeBundle } from './write'

const RECORDING_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Recording'
const RECORDING_TRANSCRIPT_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/RecordingTranscript'

interface StoredBlob {
  cid: string
  bytes: Uint8Array
  mimeType?: string
}

/**
 * A fresh store. Pass an identity to model the real portability case: the same
 * person, a new device, the same DID.
 */
function createStore(identity?: { did: DID; privateKey: Uint8Array }) {
  const keyPair = generateSigningKeyPair()
  const did = identity?.did ?? (createDID(keyPair.publicKey) as DID)
  const privateKey = identity?.privateKey ?? keyPair.privateKey
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({ storage: adapter, authorDID: did, signingKey: privateKey })
  return { store, did, privateKey }
}

function blobPort(blobs: Map<string, StoredBlob>): BundleBlobPort {
  return {
    async *list() {
      yield* blobs.values()
    },
    async has(cid) {
      return blobs.has(cid)
    },
    async put(bytes, meta) {
      const cid = meta?.cid ?? `cid:blake3:${hashHex(bytes)}`
      blobs.set(cid, { cid, bytes, mimeType: meta?.mimeType })
    }
  }
}

const CUTS = [
  { startMs: 1_000, endMs: 2_400, reason: 'silence', enabled: true },
  { startMs: 9_000, endMs: 9_300, reason: 'filler', enabled: false }
]
const CHAPTERS = [
  { startMs: 0, title: 'Dashboard walkthrough' },
  { startMs: 30_000, title: 'Filters panel' }
]

describe('recording bundles (0414)', () => {
  it('round-trips tracks, transcript, cuts and chapters', async () => {
    const source = createStore()

    const screenBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const cameraBytes = new Uint8Array([9, 9, 9, 9])
    const screenCid = `cid:blake3:${hashHex(screenBytes)}`
    const cameraCid = `cid:blake3:${hashHex(cameraBytes)}`
    const blobs = new Map<string, StoredBlob>([
      [screenCid, { cid: screenCid, bytes: screenBytes, mimeType: 'video/mp4' }],
      [cameraCid, { cid: cameraCid, bytes: cameraBytes, mimeType: 'video/mp4' }]
    ])

    const recording = await source.store.create({
      schemaId: RECORDING_SCHEMA,
      properties: {
        title: 'Onboarding walkthrough',
        startedAt: 1_750_000_000_000,
        durationMs: 120_000,
        screenTrack: { cid: screenCid, mimeType: 'video/mp4', name: 'screen.mp4' },
        cameraTrack: { cid: cameraCid, mimeType: 'video/mp4', name: 'camera.mp4' },
        cuts: CUTS,
        chapters: CHAPTERS,
        cameraLayout: { corner: 'bottom-left', size: 0.18, shape: 'circle' },
        capturePath: 'screencapturekit-helper'
      }
    })

    await source.store.create({
      schemaId: RECORDING_TRANSCRIPT_SCHEMA,
      properties: {
        recording: recording.id,
        fullText: 'Welcome to the dashboard walkthrough',
        segments: [{ text: 'Welcome to the dashboard walkthrough', startMs: 0, endMs: 4_000 }],
        engineId: 'whisper-cpp'
      }
    })

    const sink = new MemoryBundleSink()
    await writeBundle(source.store, { kind: 'full' }, sink, {
      ownerDid: source.did,
      manifestSigner: (bytes) => sign(bytes, source.privateKey),
      blobPort: blobPort(blobs)
    })

    const target = createStore(source)
    const targetBlobs = new Map<string, StoredBlob>()
    await applyBundle(target.store, sink.toSource(), {
      importerDid: source.did,
      blobPort: blobPort(targetBlobs)
    })

    const imported = await target.store.get(recording.id)
    expect(imported).toBeDefined()

    // The edit is the part that exists nowhere but this node.
    expect(imported?.properties.cuts).toEqual(CUTS)
    expect(imported?.properties.chapters).toEqual(CHAPTERS)
    expect(imported?.properties.capturePath).toBe('screencapturekit-helper')

    // Both track blobs travelled, byte for byte.
    expect(targetBlobs.get(screenCid)?.bytes).toEqual(screenBytes)
    expect(targetBlobs.get(cameraCid)?.bytes).toEqual(cameraBytes)

    const { nodes: transcripts } = await target.store.query({
      schemaId: RECORDING_TRANSCRIPT_SCHEMA,
      includeDeleted: false
    })
    expect(transcripts).toHaveLength(1)
    expect(transcripts[0]?.properties.fullText).toBe('Welcome to the dashboard walkthrough')
  })

  it('carries a truncated recording across as truncated', async () => {
    const source = createStore()
    const recording = await source.store.create({
      schemaId: RECORDING_SCHEMA,
      properties: {
        title: 'Interrupted demo',
        durationMs: 4_000,
        truncated: true,
        truncationReason: 'The disk filled up.'
      }
    })

    const sink = new MemoryBundleSink()
    await writeBundle(source.store, { kind: 'full' }, sink, {
      ownerDid: source.did,
      manifestSigner: (bytes) => sign(bytes, source.privateKey)
    })

    const target = createStore(source)
    await applyBundle(target.store, sink.toSource(), { importerDid: source.did })

    const imported = await target.store.get(recording.id)
    expect(imported?.properties.truncated).toBe(true)
    expect(imported?.properties.truncationReason).toBe('The disk filled up.')
  })
})
