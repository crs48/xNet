/**
 * Instant, throwaway demo identity — the zero-signup path (exploration 0314).
 * A DID:key + Ed25519 keypair is minted on first visit and persisted in
 * localStorage so reloads keep the same author. No account, no server.
 */
import type { Identity } from '@xnetjs/identity'
import { generateIdentity, identityFromPrivateKey } from '@xnetjs/identity'

const STORAGE_KEY = 'xnet-demos:identity-key'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function loadOrCreateIdentity(): { identity: Identity; privateKey: Uint8Array } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && /^[0-9a-f]{64,}$/.test(stored)) {
      const privateKey = fromHex(stored)
      return { identity: identityFromPrivateKey(privateKey), privateKey }
    }
  } catch {
    // localStorage unavailable (private mode) — fall through to ephemeral
  }
  const fresh = generateIdentity()
  try {
    localStorage.setItem(STORAGE_KEY, toHex(fresh.privateKey))
  } catch {
    // ephemeral identity is fine for a demo
  }
  return fresh
}

/** Short human label for a DID: `did:key:z6Mk…` → `z6Mk…abcd`. */
export function shortDid(did: string): string {
  const key = did.split(':').pop() ?? did
  return key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key
}
