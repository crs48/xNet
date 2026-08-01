import { schnorr } from '@noble/curves/secp256k1.js'
import { generateIdentity, hasCapability, verifyUCAN } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import { computeEventId, verifyNostrEvent, type NostrEvent } from './event'
import { bytesToHex, decodeBech32, decodeNpub, hexToBytes } from './nip19'
import {
  BUZZ_TOOL_REQUEST_KIND,
  connectBuzzRelay,
  parseToolRequest,
  type RelaySocket
} from './relay'
import { BUZZ_ENROLLMENT_KIND, enrollBuzzAgent, verifyBuzzProof } from './verifier'

// ─── A real Nostr keypair, so proofs are genuinely signed ──────────────────

const nostrPriv = schnorr.utils.randomSecretKey()
const nostrPubHex = bytesToHex(schnorr.getPublicKey(nostrPriv))

/** bech32-encode an x-only pubkey as an npub (test-side inverse of decodeNpub). */
function encodeNpub(pubkeyHex: string): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  const bytes = pubkeyHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))

  // 8-bit → 5-bit
  let acc = 0
  let bits = 0
  const five: number[] = []
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      five.push((acc >> bits) & 31)
    }
  }
  if (bits > 0) five.push((acc << (5 - bits)) & 31)

  const hrp = 'npub'
  const expand = [
    ...[...hrp].map((c) => c.charCodeAt(0) >> 5),
    0,
    ...[...hrp].map((c) => c.charCodeAt(0) & 31)
  ]
  const polymod = (values: number[]): number => {
    let chk = 1
    for (const v of values) {
      const top = chk >> 25
      chk = ((chk & 0x1ffffff) << 5) ^ v
      for (let i = 0; i < 5; i += 1) if ((top >> i) & 1) chk ^= GENERATOR[i]
    }
    return chk
  }
  const mod = polymod([...expand, ...five, 0, 0, 0, 0, 0, 0]) ^ 1
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31)
  return `${hrp}1${[...five, ...checksum].map((i) => CHARSET[i]).join('')}`
}

const npub = encodeNpub(nostrPubHex)

/** Build and sign a Nostr event. */
function signEvent(content: string, kind: number, pubkey = nostrPubHex): NostrEvent {
  const base = { pubkey, created_at: 1_700_000_000, kind, tags: [], content }
  const id = computeEventId({ ...base, id: '', sig: '' })
  const sig = bytesToHex(schnorr.sign(hexToBytes(id)!, nostrPriv))
  return { ...base, id, sig }
}

const proofFor = (challenge: string, kind = BUZZ_ENROLLMENT_KIND) =>
  new TextEncoder().encode(JSON.stringify(signEvent(challenge, kind)))

const operator = generateIdentity()
const CAPS = [{ with: 'xnet://space/inbox', can: 'node/create' }]

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('NIP-19 npub decoding (exploration 0416)', () => {
  it('round-trips a real key', () => {
    expect(bytesToHex(decodeNpub(npub)!)).toBe(nostrPubHex)
  })

  it('rejects malformed, mis-prefixed, and mixed-case input', () => {
    expect(decodeNpub('not-an-npub')).toBeNull()
    expect(decodeNpub('')).toBeNull()
    expect(decodeNpub(npub.slice(0, -1) + 'q')).toBeNull() // bad checksum
    expect(decodeNpub(npub.toUpperCase().slice(0, 4) + npub.slice(4))).toBeNull() // mixed case
    expect(decodeBech32(npub.replace('npub', 'nsec'))).toBeNull() // checksum binds the hrp
  })
})

describe('NIP-01 event verification (exploration 0416)', () => {
  it('verifies a correctly signed event', () => {
    expect(verifyNostrEvent(signEvent('hello', 1))).toBe(true)
  })

  it('rejects an event whose content was changed after signing', () => {
    const event = signEvent('hello', 1)
    expect(verifyNostrEvent({ ...event, content: 'goodbye' })).toBe(false)
  })

  it('rejects an event whose id was recomputed but signature not', () => {
    const event = signEvent('hello', 1)
    const tampered = { ...event, content: 'goodbye' }
    // Attacker fixes the id so check 1 passes — check 2 must still fail.
    tampered.id = computeEventId(tampered)
    expect(verifyNostrEvent(tampered)).toBe(false)
  })

  it('rejects garbage without throwing', () => {
    expect(verifyNostrEvent({} as NostrEvent)).toBe(false)
    expect(verifyNostrEvent({ ...signEvent('x', 1), sig: 'zz' })).toBe(false)
  })
})

describe('Buzz enrollment (exploration 0416)', () => {
  it('mints a scoped xNet passport from a verified npub', () => {
    const challenge = 'xnet-challenge-1'
    const enrollment = enrollBuzzAgent({
      npub,
      proof: proofFor(challenge),
      challenge: new TextEncoder().encode(challenge),
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })

    expect(enrollment.origin).toBe('buzz')
    expect(enrollment.foreignKey).toBe(npub)
    // The xNet identity is fresh — the Nostr key never becomes an xNet key.
    expect(enrollment.agentDID).toMatch(/^did:key:z/)
    expect(enrollment.agentDID).not.toContain(nostrPubHex)
  })

  it('grants only the delegated capability — a write outside it is refused', () => {
    const challenge = 'c'
    const enrollment = enrollBuzzAgent({
      npub,
      proof: proofFor(challenge),
      challenge: new TextEncoder().encode(challenge),
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })
    const payload = verifyUCAN(enrollment.ucan).payload!

    expect(hasCapability(payload, 'xnet://space/inbox', 'node/create')).toBe(true)
    // Another space, another action, and a delete — none of them delegated.
    expect(hasCapability(payload, 'xnet://space/private', 'node/create')).toBe(false)
    expect(hasCapability(payload, 'xnet://space/inbox', 'node/update')).toBe(false)
    expect(hasCapability(payload, 'xnet://space/inbox', 'node/delete')).toBe(false)
  })

  it('refuses a proof over a different challenge (replay)', () => {
    expect(() =>
      enrollBuzzAgent({
        npub,
        proof: proofFor('some-older-challenge'),
        challenge: new TextEncoder().encode('xnet-challenge-2'),
        operatorDID: operator.identity.did,
        operatorKey: operator.privateKey,
        capabilities: CAPS
      })
    ).toThrow(/Unverified buzz agent key/)
  })

  it('refuses a proof signed by a different key than the npub names', () => {
    const otherPub = bytesToHex(schnorr.getPublicKey(schnorr.utils.randomSecretKey()))
    const claim = {
      origin: 'buzz' as const,
      foreignKey: encodeNpub(otherPub),
      proof: proofFor('c'),
      challenge: new TextEncoder().encode('c')
    }
    expect(verifyBuzzProof(claim)).toBe(false)
  })

  it('refuses a proof of the wrong event kind', () => {
    const claim = {
      origin: 'buzz' as const,
      foreignKey: npub,
      proof: proofFor('c', 1),
      challenge: new TextEncoder().encode('c')
    }
    expect(verifyBuzzProof(claim)).toBe(false)
  })

  it('refuses non-buzz origins and unparseable proofs', () => {
    expect(
      verifyBuzzProof({
        origin: 'a2a',
        foreignKey: npub,
        proof: proofFor('c'),
        challenge: new TextEncoder().encode('c')
      })
    ).toBe(false)
    expect(
      verifyBuzzProof({
        origin: 'buzz',
        foreignKey: npub,
        proof: new TextEncoder().encode('not json'),
        challenge: new TextEncoder().encode('c')
      })
    ).toBe(false)
  })
})

describe('Buzz relay routing (exploration 0416)', () => {
  function fakeSocket() {
    const handlers: Record<string, ((e: never) => void)[]> = {}
    const sent: string[] = []
    const socket: RelaySocket = {
      send: (data) => sent.push(data),
      close: vi.fn(),
      addEventListener: (type: string, handler: (e: never) => void) => {
        const list = (handlers[type] ??= [])
        list.push(handler)
      }
    }
    const emit = (data: string) => handlers.message?.forEach((h) => h({ data } as never))
    return { socket, sent, emit }
  }

  const requestFrame = (tool: string, args: Record<string, unknown> = {}) =>
    JSON.stringify([
      'EVENT',
      'sub',
      signEvent(JSON.stringify({ tool, args }), BUZZ_TOOL_REQUEST_KIND)
    ])

  it('subscribes to only the enrolled agent', () => {
    const { socket, sent } = fakeSocket()
    connectBuzzRelay({
      relayUrl: 'wss://relay.example',
      agentNpub: npub,
      guard: { callTool: vi.fn() },
      connect: () => socket
    })

    expect(JSON.parse(sent[0])).toEqual([
      'REQ',
      'xnet-agent',
      { kinds: [BUZZ_TOOL_REQUEST_KIND], authors: [nostrPubHex] }
    ])
  })

  it('routes a verified request through the guardrail and replies', async () => {
    const { socket, sent, emit } = fakeSocket()
    const callTool = vi.fn().mockResolvedValue({ rows: 2 })
    const handle = connectBuzzRelay({
      relayUrl: 'wss://relay.example',
      agentNpub: npub,
      guard: { callTool },
      connect: () => socket
    })

    emit(requestFrame('xnet_query', { schema: 'Task' }))
    await vi.waitFor(() => expect(sent).toHaveLength(2))

    expect(callTool).toHaveBeenCalledWith('xnet_query', { schema: 'Task' }, undefined)
    const [tag, , payload] = JSON.parse(sent[1])
    expect(tag).toBe('XNET-RESULT')
    expect(payload).toEqual({ ok: true, result: { rows: 2 } })
    expect(handle.handled).toBe(1)
  })

  it('reports a guardrail refusal rather than dropping it', async () => {
    const { socket, sent, emit } = fakeSocket()
    const callTool = vi.fn().mockRejectedValue(new Error('Egress budget exhausted'))
    connectBuzzRelay({
      relayUrl: 'wss://relay.example',
      agentNpub: npub,
      guard: { callTool },
      connect: () => socket,
      onWarning: () => {}
    })

    emit(requestFrame('xnet_query'))
    await vi.waitFor(() => expect(sent).toHaveLength(2))

    const [, , payload] = JSON.parse(sent[1])
    expect(payload).toEqual({ ok: false, error: 'Egress budget exhausted' })
  })

  it('never routes an event from another author, even if well-formed', () => {
    const otherPriv = schnorr.utils.randomSecretKey()
    const otherPub = bytesToHex(schnorr.getPublicKey(otherPriv))
    const base = {
      pubkey: otherPub,
      created_at: 1,
      kind: BUZZ_TOOL_REQUEST_KIND,
      tags: [],
      content: JSON.stringify({ tool: 'xnet_delete' })
    }
    const id = computeEventId({ ...base, id: '', sig: '' })
    const event = { ...base, id, sig: bytesToHex(schnorr.sign(hexToBytes(id)!, otherPriv)) }

    expect(
      parseToolRequest(JSON.stringify(['EVENT', 's', event]), nostrPubHex, BUZZ_TOOL_REQUEST_KIND)
    ).toBeNull()
  })

  it('ignores unparseable frames, wrong kinds, and unsigned events', () => {
    const k = BUZZ_TOOL_REQUEST_KIND
    expect(parseToolRequest('not json', nostrPubHex, k)).toBeNull()
    expect(parseToolRequest(JSON.stringify(['NOTICE', 'hi']), nostrPubHex, k)).toBeNull()
    expect(
      parseToolRequest(
        JSON.stringify(['EVENT', 's', signEvent(JSON.stringify({ tool: 'x' }), 1)]),
        nostrPubHex,
        k
      )
    ).toBeNull()
    // Valid signature, but no tool name.
    expect(
      parseToolRequest(
        JSON.stringify(['EVENT', 's', signEvent(JSON.stringify({ nope: 1 }), k)]),
        nostrPubHex,
        k
      )
    ).toBeNull()
  })

  it('fails at setup on an invalid npub rather than accepting everything', () => {
    expect(() =>
      connectBuzzRelay({
        relayUrl: 'wss://relay.example',
        agentNpub: 'garbage',
        guard: { callTool: vi.fn() },
        connect: () => fakeSocket().socket
      })
    ).toThrow(/Not a valid npub/)
  })
})
