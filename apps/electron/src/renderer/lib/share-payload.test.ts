import { describe, expect, it } from 'vitest'
import {
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
    endpoint: 'wss://relay.example.com',
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
})
