/**
 * ATProto binding verification (0301/0322/0337): DID-doc resolve → record
 * fetch from the canonical PDS → xNet-signature check → cache/revoke.
 */
import { createAtprotoBinding, generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { AtprotoBindingVerifier } from '../src/services/atproto-binding'

const PLC = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const PDS = 'https://pds.example.com'

const didDoc = (overrides: Record<string, unknown> = {}) => ({
  id: PLC,
  alsoKnownAs: ['at://alice.example.com'],
  service: [
    {
      id: '#atproto_pds',
      type: 'AtprotoPersonalDataServer',
      serviceEndpoint: PDS
    }
  ],
  ...overrides
})

type FetchFixture = {
  doc?: unknown
  record?: unknown
  recordStatus?: number
  calls: string[]
}

const makeFetch = (fixture: FetchFixture): typeof fetch =>
  (async (input: string | URL | Request) => {
    const url = String(input)
    fixture.calls.push(url)
    if (url.includes('plc.directory')) {
      return new Response(JSON.stringify(fixture.doc ?? didDoc()), { status: 200 })
    }
    if (url.includes('com.atproto.repo.getRecord')) {
      if (fixture.recordStatus) return new Response('{}', { status: fixture.recordStatus })
      return new Response(
        JSON.stringify({
          uri: `at://${PLC}/net.x.identity.binding/self`,
          value: fixture.record
        }),
        { status: 200 }
      )
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(JSON.stringify({ authorization_servers: ['https://as.example.com'] }), {
        status: 200
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

describe('AtprotoBindingVerifier', () => {
  it('verifies a genuine binding and caches it', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    const fixture: FetchFixture = { record, calls: [] }
    const verifier = new AtprotoBindingVerifier({ fetchImpl: makeFetch(fixture) })

    const first = await verifier.verify(PLC, identity.did)
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.binding.handle).toBe('alice.example.com')
      expect(first.binding.pds).toBe(PDS)
      expect(first.binding.xnetDid).toBe(identity.did)
      expect(first.cached).toBe(false)
    }

    const callsAfterFirst = fixture.calls.length
    const second = await verifier.verify(PLC, identity.did)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.cached).toBe(true)
    expect(fixture.calls.length).toBe(callsAfterFirst)

    // Revoke drops the cache → re-fetches.
    verifier.revoke(PLC)
    await verifier.verify(PLC)
    expect(fixture.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('rejects a binding signed by a different xNet key than expected', async () => {
    const alice = generateIdentity()
    const mallory = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: alice.identity.did,
      signingKey: alice.privateKey,
      atprotoDid: PLC
    })
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: makeFetch({ record, calls: [] })
    })
    const result = await verifier.verify(PLC, mallory.identity.did)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/different xNet DID/)
  })

  it('rejects a tampered record (signature check fails)', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: makeFetch({
        record: { ...record, createdAt: new Date(0).toISOString() },
        calls: []
      })
    })
    const result = await verifier.verify(PLC, identity.did)
    expect(result.ok).toBe(false)
  })

  it('rejects when the repo has no binding record', async () => {
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: makeFetch({ recordStatus: 400, calls: [] })
    })
    const result = await verifier.verify(PLC)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/No binding record/)
  })

  it('rejects a DID document that names a different DID', async () => {
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: makeFetch({ doc: didDoc({ id: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' }), calls: [] })
    })
    const result = await verifier.verify(PLC)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/does not match/)
  })

  it('rejects non-ATProto DIDs outright', async () => {
    const verifier = new AtprotoBindingVerifier({ fetchImpl: makeFetch({ calls: [] }) })
    const result = await verifier.verify('did:key:z6MkNotForeign')
    expect(result.ok).toBe(false)
  })

  it('resolves the authorization server for a PDS (escrow issuer check)', async () => {
    const verifier = new AtprotoBindingVerifier({ fetchImpl: makeFetch({ calls: [] }) })
    expect(await verifier.resolveAuthorizationServer(PDS)).toBe('https://as.example.com')
  })
})
