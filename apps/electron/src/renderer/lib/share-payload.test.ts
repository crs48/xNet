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

  it('rejects ws endpoints outside localhost', () => {
    const payload = createPayload({ endpoint: 'ws://hub.xnet.fyi' })
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
      expect(parsed.securityWarnings).toContain('Ignored 1 unapproved ICE URL from share link.')
    }
  })

  it('prefers TURN over TLS relay candidates when parsing hints', () => {
    const previousAllowed = process.env.XNET_ALLOWED_ICE_HOSTS
    process.env.XNET_ALLOWED_ICE_HOSTS = 'turn.cloudflare.com,stun.cloudflare.com'

    try {
      const payload = createPayload({
        transportHints: {
          webrtc: true,
          iceServers: [
            {
              urls: [
                'stun:stun.cloudflare.com:3478',
                'turn:turn.cloudflare.com:3478?transport=udp',
                'turns:turn.cloudflare.com:5349?transport=tcp'
              ]
            }
          ]
        }
      })

      const encoded = encodeSharePayloadV2(payload)
      const parsed = parseShareInput(encoded)

      expect(parsed.kind).toBe('v2')
      if (parsed.kind === 'v2') {
        expect(parsed.payload.transportHints?.iceServers?.[0]?.urls).toEqual([
          'turns:turn.cloudflare.com:5349?transport=tcp',
          'turn:turn.cloudflare.com:3478?transport=udp',
          'stun:stun.cloudflare.com:3478'
        ])
        expect(parsed.securityWarnings).toContain(
          'Reordered ICE candidates to prefer TURN over TLS relay paths.'
        )
      }
    } finally {
      if (typeof previousAllowed === 'undefined') {
        delete process.env.XNET_ALLOWED_ICE_HOSTS
      } else {
        process.env.XNET_ALLOWED_ICE_HOSTS = previousAllowed
      }
    }
  })

  it('surfaces warning when unapproved ICE infra is removed', () => {
    const previousAllowed = process.env.XNET_ALLOWED_ICE_HOSTS
    process.env.XNET_ALLOWED_ICE_HOSTS = 'turn.cloudflare.com'

    try {
      const payload = createPayload({
        transportHints: {
          webrtc: true,
          iceServers: [
            {
              urls: ['turn:turn.cloudflare.com:3478?transport=tcp', 'turn:evil.example.com:3478']
            }
          ]
        }
      })

      const encoded = encodeSharePayloadV2(payload)
      const parsed = parseShareInput(encoded)

      expect(parsed.kind).toBe('v2')
      if (parsed.kind === 'v2') {
        expect(parsed.payload.transportHints?.iceServers).toEqual([
          {
            urls: ['turn:turn.cloudflare.com:3478?transport=tcp'],
            username: undefined,
            credential: undefined
          }
        ])
        expect(parsed.securityWarnings).toContain('Ignored 1 unapproved ICE URL from share link.')
      }
    } finally {
      if (typeof previousAllowed === 'undefined') {
        delete process.env.XNET_ALLOWED_ICE_HOSTS
      } else {
        process.env.XNET_ALLOWED_ICE_HOSTS = previousAllowed
      }
    }
  })

  it('fuzzes malformed payloads defensively', () => {
    const malformedObjects = [
      {
        v: 2,
        resource: 'doc-1',
        docType: 'page',
        endpoint: 123,
        token: 'abc',
        exp: Date.now() + 10_000
      },
      {
        v: 2,
        resource: 'doc-1',
        docType: 'page',
        endpoint: 'wss://hub.xnet.fyi',
        token: '',
        exp: Date.now() + 10_000
      },
      {
        v: 2,
        resource: 'doc-1',
        docType: 'page',
        endpoint: 'wss://hub.xnet.fyi',
        token: 'abc',
        exp: -1
      },
      {
        v: 2,
        resource: 'doc-1',
        docType: 'page',
        endpoint: 'wss://hub.xnet.fyi',
        token: 'abc',
        exp: Date.now() + 10_000,
        transportHints: { iceServers: [{ urls: [123] }] }
      }
    ]

    for (const malformed of malformedObjects) {
      const encoded = Buffer.from(JSON.stringify(malformed)).toString('base64url')
      expect(() => parseShareInput(encoded)).toThrow()
    }

    const randomChars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!@#$%^&*()[]{}'
    for (let i = 0; i < 64; i++) {
      const length = 16 + Math.floor(Math.random() * 64)
      let candidate = ''
      for (let j = 0; j < length; j++) {
        candidate += randomChars[Math.floor(Math.random() * randomChars.length)]
      }
      expect(() => parseShareInput(`https://xnet.fyi/app/share?payload=${candidate}`)).toThrow()
    }
  })
})
