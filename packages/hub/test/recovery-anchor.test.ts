/**
 * Recovery-anchor escrow: ATProto anchor verification + escrow enroll/release
 * (explorations 0243/0322/0338).
 */
import { createAtprotoBinding, generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { AtprotoBindingVerifier } from '../src/services/atproto-binding'
import { AtprotoRecoveryAnchor } from '../src/services/atproto-recovery-anchor'
import { EscrowStore } from '../src/services/escrow-store'

const PLC = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const PDS = 'https://pds.example.com'

const makeFetch = (opts: {
  record: unknown
  createdAt?: string
  withAs?: boolean
}): typeof fetch =>
  (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('plc.directory')) {
      return new Response(
        JSON.stringify({
          id: PLC,
          alsoKnownAs: ['at://alice.example.com'],
          service: [
            { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }
          ]
        }),
        { status: 200 }
      )
    }
    if (url.includes('com.atproto.repo.getRecord')) {
      return new Response(
        JSON.stringify({ uri: `at://${PLC}/net.x.identity.binding/self`, value: opts.record }),
        { status: 200 }
      )
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(
        JSON.stringify(opts.withAs === false ? {} : { authorization_servers: ['https://as.example.com'] }),
        { status: opts.withAs === false ? 200 : 200 }
      )
    }
    return new Response('nf', { status: 404 })
  }) as typeof fetch

describe('AtprotoRecoveryAnchor.verifyCeremony', () => {
  it('verifies a genuine bound ATProto identity', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({ xnetDid: identity.did, signingKey: privateKey, atprotoDid: PLC })
    const verifier = new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record }) })
    const anchor = new AtprotoRecoveryAnchor(verifier)

    const result = await anchor.verifyCeremony({
      code: 'ignored',
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(true)
    expect(result.subject).toBe(PLC)
  })

  it('rejects a binding bound to a different xNet DID', async () => {
    const alice = generateIdentity()
    const mallory = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: alice.identity.did,
      signingKey: alice.privateKey,
      atprotoDid: PLC
    })
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record }) })
    )
    const result = await anchor.verifyCeremony({
      code: 'x',
      expectedSubject: PLC,
      boundXnetDid: mallory.identity.did
    })
    expect(result.verified).toBe(false)
  })

  it('rejects when the canonical PDS advertises no authorization server', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({ xnetDid: identity.did, signingKey: privateKey, atprotoDid: PLC })
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record, withAs: false }) })
    )
    const result = await anchor.verifyCeremony({
      code: 'x',
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/authorization server/)
  })

  it('rejects a binding outside the freshness window', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC,
      now: new Date(1000)
    })
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record }) }),
      { maxBindingAgeMs: 1000, now: () => 10_000_000 }
    )
    const result = await anchor.verifyCeremony({
      code: 'x',
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/freshness/)
  })
})

describe('EscrowStore', () => {
  it('enrolls, reads, and removes', () => {
    const store = new EscrowStore()
    store.enroll({
      xnetDid: 'did:key:alice',
      anchorKind: 'atproto',
      anchorSubject: PLC,
      sealedEscrowB64: 'c2VhbGVk',
      enrolledAt: 1
    })
    expect(store.get('did:key:alice')?.sealedEscrowB64).toBe('c2VhbGVk')
    expect(store.get('did:key:bob')).toBeNull()
    store.remove('did:key:alice')
    expect(store.get('did:key:alice')).toBeNull()
  })
})
