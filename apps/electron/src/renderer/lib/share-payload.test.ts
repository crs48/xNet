import { describe, expect, it } from 'vitest'
import {
  buildUniversalShareHandleUrl,
  buildUniversalShareUrl,
  decodeSharePayloadV2,
  encodeSharePayloadV2,
  parseShareInput,
  type SharePayloadV2
} from './share-payload'

function createPayload(overrides?: Partial<SharePayloadV2>): SharePayloadV2 {
  return {
    v: 2,
    resource: 'doc-123',
    docType: 'page',
    endpoint: 'wss://hub.xnet.fyi',
    token: 'token-abc',
    exp: Date.now() + 60_000,
    ...overrides
  }
}

describe('share-payload', () => {
  it('encodes and decodes v2 payloads', () => {
    const payload = createPayload()
    const encoded = encodeSharePayloadV2(payload)
    const decoded = decodeSharePayloadV2(encoded)

    expect(decoded).toEqual(payload)
  })

  it('builds universal share urls', () => {
    const payload = createPayload()
    const url = buildUniversalShareUrl(payload)

    expect(url).toContain('https://xnet.fyi/app/share?payload=')
  })

  it('builds hash-routed share urls', () => {
    const payload = createPayload()
    const url = buildUniversalShareUrl(payload, { useHashRouting: true })

    expect(url).toContain('https://xnet.fyi/app#/share?payload=')
  })

  it('parses universal share URLs', () => {
    const payload = createPayload()
    const url = buildUniversalShareUrl(payload)
    const parsed = parseShareInput(url)

    expect(parsed.kind).toBe('v2')
    if (parsed.kind === 'v2') {
      expect(parsed.payload.resource).toBe('doc-123')
      expect(parsed.payload.docType).toBe('page')
    }
  })

  it('builds and parses handle-based share links', () => {
    const url = buildUniversalShareHandleUrl({ handle: 'sh_abcdefghijklmnopqrstuvwxyz' })
    const parsed = parseShareInput(url)

    expect(parsed).toEqual({ kind: 'handle', handle: 'sh_abcdefghijklmnopqrstuvwxyz' })
  })

  it('parses legacy type-prefixed shares', () => {
    const parsed = parseShareInput('database:db-123')

    expect(parsed).toEqual({
      kind: 'legacy',
      docType: 'database',
      docId: 'db-123'
    })
  })

  it('rejects expired v2 payloads', () => {
    const payload = createPayload({ exp: Date.now() - 10 })
    const encoded = encodeSharePayloadV2(payload)

    expect(() => parseShareInput(encoded)).toThrow('Share link has expired')
  })

  it('accepts valid ICE server configuration in transport hints', () => {
    const payload = createPayload({
      transportHints: {
        webrtc: true,
        iceServers: [
          {
            urls: ['stun:stun.cloudflare.com:3478']
          },
          {
            urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
            username: 'xnet-user',
            credential: 'xnet-pass'
          }
        ]
      }
    })

    const encoded = encodeSharePayloadV2(payload)
    const decoded = decodeSharePayloadV2(encoded)

    expect(decoded.transportHints?.iceServers).toHaveLength(2)
  })

  it('rejects malformed ICE server configuration', () => {
    const payload = createPayload({
      transportHints: {
        webrtc: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iceServers: [{ urls: [123 as any] }]
      }
    })

    expect(() => encodeSharePayloadV2(payload)).toThrow(
      'Share payload has invalid ICE server configuration'
    )
  })

  it('rejects untrusted signaling endpoints', () => {
    const payload = createPayload({ endpoint: 'wss://attacker.example.com' })
    expect(() => encodeSharePayloadV2(payload)).toThrow('Share payload endpoint is not trusted')
  })

  it('drops inbound ICE servers unless explicitly allowlisted', () => {
    const payload = createPayload({
      transportHints: {
        webrtc: true,
        iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=tcp'] }]
      }
    })
    const encoded = encodeSharePayloadV2(payload)
    const parsed = parseShareInput(encoded)

    expect(parsed.kind).toBe('v2')
    if (parsed.kind === 'v2') {
      expect(parsed.payload.transportHints?.iceServers).toBeUndefined()
    }
  })
})
