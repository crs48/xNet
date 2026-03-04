/**
 * Signed update handling for document changes
 */
import type { SignedUpdate, VectorClock } from '@xnetjs/core'
import type { Doc } from 'yjs'
import { sign, verify, hashHex } from '@xnetjs/crypto'
import * as Y from 'yjs'

/**
 * Options for signing an update
 */
export interface SignUpdateOptions {
  doc: Doc
  update: Uint8Array
  authorDID: string
  signingKey: Uint8Array
  parentHash: string
  vectorClock: VectorClock
}

/**
 * Sign a Yjs update with the author's key
 */
export function signUpdate(options: SignUpdateOptions): SignedUpdate {
  const { update, authorDID, signingKey, parentHash, vectorClock } = options

  const updateHash = hashHex(update)
  const timestamp = Date.now()

  // Create signature over hash + parent + author + timestamp
  const signaturePayload = new TextEncoder().encode(
    JSON.stringify({ updateHash, parentHash, authorDID, timestamp })
  )
  const signature = sign(signaturePayload, signingKey)

  return {
    update,
    parentHash,
    updateHash,
    authorDID,
    signature,
    timestamp,
    vectorClock
  }
}

/**
 * Verify a signed update
 */
export function verifyUpdate(
  update: SignedUpdate,
  getPublicKey: (did: string) => Uint8Array | null
): boolean {
  const publicKey = getPublicKey(update.authorDID)
  if (!publicKey) return false

  // Verify hash matches
  const actualHash = hashHex(update.update)
  if (actualHash !== update.updateHash) return false

  // Verify signature
  const signaturePayload = new TextEncoder().encode(
    JSON.stringify({
      updateHash: update.updateHash,
      parentHash: update.parentHash,
      authorDID: update.authorDID,
      timestamp: update.timestamp
    })
  )

  return verify(signaturePayload, update.signature, publicKey)
}

/**
 * Apply a signed update to a document
 */
export function applySignedUpdate(doc: Doc, update: SignedUpdate): void {
  Y.applyUpdate(doc, update.update)
}

/**
 * Capture an update during a callback and sign it
 */
export function captureUpdate(
  doc: Doc,
  authorDID: string,
  signingKey: Uint8Array,
  parentHash: string,
  vectorClock: VectorClock,
  callback: () => void
): SignedUpdate | null {
  let capturedUpdate: Uint8Array | null = null

  const handler = (update: Uint8Array) => {
    capturedUpdate = update
  }

  doc.on('update', handler)
  callback()
  doc.off('update', handler)

  if (!capturedUpdate) return null

  return signUpdate({
    doc,
    update: capturedUpdate,
    authorDID,
    signingKey,
    parentHash,
    vectorClock
  })
}

/**
 * Merge multiple documents into one, handling concurrent updates
 */
export function mergeDocuments(target: Doc, sources: Doc[]): void {
  for (const source of sources) {
    const state = Y.encodeStateAsUpdate(source)
    Y.applyUpdate(target, state)
  }
}

/**
 * Get missing updates between two state vectors
 */
export function getMissingUpdates(doc: Doc, remoteStateVector: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, remoteStateVector)
}
