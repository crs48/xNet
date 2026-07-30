/**
 * @xnetjs/hub - The hub's own system identity (explorations 0371/0383 W4).
 *
 * A persistent `did:key` for the hub itself, generated on first boot and kept
 * in the data dir, so the hub's signatures are stable across restarts. Two
 * consumers from day one:
 *
 * - **Relay envelope signing** — previously an ephemeral per-boot identity,
 *   so hub-signed envelopes changed author on every restart; now stable.
 * - **`/health` + config `hubDid`** — peers, integrations and the federation
 *   registry can address this hub by DID (the 0371 blocker: six integrations
 *   discard writes because "the hub has no system identity").
 *
 * THE RULE (0371, enforced by review + the R4 validation check): the hub DID
 * signs TRANSPORT — envelopes, federation responses, subscriptions — and is
 * NEVER a node author. "Signature says who vouched, content says who spoke";
 * a hub that authors content with its system key has forged a voice.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { base64ToBytes, bytesToBase64 } from '@xnetjs/crypto'
import { generateIdentity, identityFromPrivateKey } from '@xnetjs/identity'

const FILE = 'hub_identity.json'

export interface HubIdentity {
  did: string
  privateKey: Uint8Array
}

/** Load the persistent hub identity, minting one on first boot. */
export function loadOrCreateHubIdentity(dataDir: string): HubIdentity {
  mkdirSync(dataDir, { recursive: true })
  const path = join(dataDir, FILE)
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { privateKeyB64: string }
    const privateKey = base64ToBytes(parsed.privateKeyB64)
    return { did: identityFromPrivateKey(privateKey).did, privateKey }
  }
  const generated = generateIdentity()
  writeFileSync(
    path,
    JSON.stringify(
      { did: generated.identity.did, privateKeyB64: bytesToBase64(generated.privateKey) },
      null,
      2
    )
  )
  return { did: generated.identity.did, privateKey: generated.privateKey }
}
