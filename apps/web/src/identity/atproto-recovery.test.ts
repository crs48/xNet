/**
 * "Recover with Bluesky" client orchestration (0389). Drives the challenge
 * dance against the secured hub: request nonce → write it into the user's repo
 * → release. Tested against a mock hub + session, no network.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  recoverWithAtproto,
  buildChallengeRecord,
  RecoveryError,
  type AtprotoWriteSession,
  type RecoveryChallenge
} from './atproto-recovery'

const XNET_DID = 'did:key:zAlice'
const HUB = 'https://hub.example'
const CHALLENGE: RecoveryChallenge = {
  nonce: 'nonce-123',
  expiresAt: 9_999_999_999_999,
  collection: 'fyi.xnet.identity.challenge',
  rkey: 'self'
}

function mockSession(): AtprotoWriteSession & { written: Array<Record<string, unknown>> } {
  const written: Array<Record<string, unknown>> = []
  return {
    did: 'did:plc:alice',
    written,
    async putRecord(input) {
      written.push(input.record)
    }
  }
}

/** A hub that mints CHALLENGE and releases a fixed blob when the code matches. */
function mockHub(opts: { sealed?: string; releaseStatus?: number } = {}) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/recovery-anchor/challenge')) {
      return new Response(JSON.stringify(CHALLENGE), { status: 200 })
    }
    if (u.endsWith('/recovery-anchor/release')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { code?: string }
      if (opts.releaseStatus && opts.releaseStatus !== 200) {
        return new Response(JSON.stringify({ reason: 'denied' }), { status: opts.releaseStatus })
      }
      if (body.code !== CHALLENGE.nonce) {
        return new Response(JSON.stringify({ reason: 'bad nonce' }), { status: 403 })
      }
      return new Response(JSON.stringify({ ok: true, sealedEscrowB64: opts.sealed ?? 'c2VhbA' }), {
        status: 200
      })
    }
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('buildChallengeRecord', () => {
  it('stamps type, nonce, DID and an ISO timestamp', () => {
    const rec = buildChallengeRecord(CHALLENGE, XNET_DID, 0)
    expect(rec).toEqual({
      $type: 'fyi.xnet.identity.challenge',
      nonce: 'nonce-123',
      xnetDid: XNET_DID,
      createdAt: '1970-01-01T00:00:00.000Z'
    })
  })
})

describe('recoverWithAtproto', () => {
  it('runs challenge → write → release and returns the sealed blob', async () => {
    const session = mockSession()
    const sealed = await recoverWithAtproto(HUB, XNET_DID, session, {
      fetchImpl: mockHub({ sealed: 'BLOB' }),
      now: () => 0
    })
    expect(sealed).toBe('BLOB')
    // The nonce was written into the user's own repo — the proof of control.
    expect(session.written).toHaveLength(1)
    expect(session.written[0].nonce).toBe('nonce-123')
    expect(session.written[0].xnetDid).toBe(XNET_DID)
  })

  it('writes the record BEFORE calling release', async () => {
    const order: string[] = []
    const session: AtprotoWriteSession = {
      did: 'did:plc:alice',
      async putRecord() {
        order.push('write')
      }
    }
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.endsWith('/challenge')) return new Response(JSON.stringify(CHALLENGE), { status: 200 })
      order.push('release')
      return new Response(JSON.stringify({ sealedEscrowB64: 'x' }), { status: 200 })
    }) as unknown as typeof fetch
    await recoverWithAtproto(HUB, XNET_DID, session, { fetchImpl, now: () => 0 })
    expect(order).toEqual(['write', 'release'])
  })

  it('surfaces a 404 as "no escrow enrolled"', async () => {
    await expect(
      recoverWithAtproto(HUB, XNET_DID, mockSession(), {
        fetchImpl: mockHub({ releaseStatus: 404 }),
        now: () => 0
      })
    ).rejects.toThrow(/No escrow is enrolled/)
  })

  it('surfaces a refusal reason from the hub', async () => {
    await expect(
      recoverWithAtproto(HUB, XNET_DID, mockSession(), {
        fetchImpl: mockHub({ releaseStatus: 403 }),
        now: () => 0
      })
    ).rejects.toThrow(/denied/)
  })

  it('tags the failing step when the PDS write fails', async () => {
    const session: AtprotoWriteSession = {
      did: 'did:plc:alice',
      async putRecord() {
        throw new Error('PDS offline')
      }
    }
    await expect(
      recoverWithAtproto(HUB, XNET_DID, session, { fetchImpl: mockHub(), now: () => 0 })
    ).rejects.toMatchObject({ step: 'write' } satisfies Partial<RecoveryError>)
  })
})
