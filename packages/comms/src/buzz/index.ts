/**
 * Buzz (Block, Nostr) agent interop — exploration 0416.
 *
 * Buzz agents already carry their own keypairs; this adapter accepts that
 * identity as evidence and mints a scoped xNet passport from it, then routes
 * the agent's tool calls through xNet's own guardrail.
 */

export { decodeBech32, decodeNpub, bytesToHex, hexToBytes, NOSTR_PUBKEY_BYTES } from './nip19'
export { computeEventId, serializeEvent, verifyNostrEvent, type NostrEvent } from './event'
export {
  BUZZ_ENROLLMENT_KIND,
  enrollBuzzAgent,
  verifyBuzzProof,
  type EnrollBuzzAgentOptions
} from './verifier'
export {
  BUZZ_TOOL_REQUEST_KIND,
  connectBuzzRelay,
  parseToolRequest,
  type BuzzRelayHandle,
  type BuzzRelayOptions,
  type BuzzToolRequest,
  type GuardedToolCaller,
  type RelaySocket,
  type RelaySocketFactory
} from './relay'
