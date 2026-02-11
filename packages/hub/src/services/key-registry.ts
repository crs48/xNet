/**
 * @xnet/hub - X25519 key registry for DID key resolution fallback.
 */

import type { DID } from '@xnet/core'
import { bytesToHex, extractEd25519PubKey, sign, verify } from '@xnet/crypto'

export type KeyRegistryRecord = {
  did: DID
  x25519PublicKey: Uint8Array
  proof: Uint8Array
  registeredAt: number
  updatedAt: number
}

export class KeyRegistryError extends Error {
  readonly code: 'INVALID_DID' | 'INVALID_KEY' | 'INVALID_PROOF'

  constructor(code: 'INVALID_DID' | 'INVALID_KEY' | 'INVALID_PROOF', message: string) {
    super(message)
    this.name = 'KeyRegistryError'
    this.code = code
  }
}

const PROOF_CONTEXT = 'xnet:key-registry:v1'

const createProofMessage = (did: DID, x25519PublicKey: Uint8Array): Uint8Array =>
  new TextEncoder().encode(`${PROOF_CONTEXT}:${did}:${bytesToHex(x25519PublicKey)}`)

/**
 * In-memory key registry backing `/keys` endpoints.
 */
export class KeyRegistryService {
  private readonly records = new Map<DID, KeyRegistryRecord>()

  async register(input: {
    did: DID
    x25519PublicKey: Uint8Array
    proof: Uint8Array
  }): Promise<KeyRegistryRecord> {
    const { did, x25519PublicKey, proof } = input

    const didPublicKey = extractEd25519PubKey(did)
    if (!didPublicKey) {
      throw new KeyRegistryError('INVALID_DID', `Invalid DID for key registration: ${did}`)
    }

    if (x25519PublicKey.length !== 32) {
      throw new KeyRegistryError('INVALID_KEY', 'x25519PublicKey must be 32 bytes')
    }

    const message = createProofMessage(did, x25519PublicKey)
    if (!verify(message, proof, didPublicKey)) {
      throw new KeyRegistryError('INVALID_PROOF', 'Key registration proof signature is invalid')
    }

    const now = Date.now()
    const existing = this.records.get(did)
    const record: KeyRegistryRecord = {
      did,
      x25519PublicKey,
      proof,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now
    }

    this.records.set(did, record)
    return record
  }

  async get(did: DID): Promise<KeyRegistryRecord | null> {
    return this.records.get(did) ?? null
  }

  async getBatch(dids: DID[]): Promise<Map<DID, Uint8Array>> {
    const results = new Map<DID, Uint8Array>()
    for (const did of dids) {
      const record = this.records.get(did)
      if (record) results.set(did, record.x25519PublicKey)
    }
    return results
  }
}

export { createProofMessage as createKeyRegistryProofMessage }

/**
 * Test-only helper for generating a valid proof.
 */
export const createKeyRegistryProof = (
  did: DID,
  x25519PublicKey: Uint8Array,
  signingKey: Uint8Array
): Uint8Array => sign(createProofMessage(did, x25519PublicKey), signingKey)
