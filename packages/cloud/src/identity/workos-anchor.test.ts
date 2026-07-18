/**
 * WorkOS recovery anchor (0243/0322/0338): adapts WorkOSAuthKitProvider to the
 * RecoveryAnchorProvider contract.
 */
import { describe, expect, it } from 'vitest'
import { WorkOSAuthKitProvider } from './workos'
import { WorkOSRecoveryAnchor } from './workos-anchor'

const makeProvider = (userId: string): WorkOSAuthKitProvider =>
  new WorkOSAuthKitProvider({
    clientId: 'client_test',
    apiKey: 'sk_test',
    redirectUri: 'https://cloud.xnet.fyi/callback',
    fetchImpl: (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/user_management/authenticate')) {
        return new Response(
          JSON.stringify({
            user: { id: userId, email: 'a@example.com', email_verified: true },
            access_token: 'tok'
          }),
          { status: 200 }
        )
      }
      return new Response('nf', { status: 404 })
    }) as typeof fetch
  })

describe('WorkOSRecoveryAnchor', () => {
  it('begins a ceremony via the AuthKit authorize URL', async () => {
    const anchor = new WorkOSRecoveryAnchor(makeProvider('user_1'))
    const start = await anchor.beginCeremony({
      state: 's1',
      redirectUri: 'https://cloud.xnet.fyi/cb'
    })
    expect(start.url).toContain('/user_management/authorize')
    expect(start.url).toContain('state=s1')
    expect(start.state).toBe('s1')
  })

  it('verifies when the authenticated user matches the enrolled subject', async () => {
    const anchor = new WorkOSRecoveryAnchor(makeProvider('user_1'))
    const result = await anchor.verifyCeremony({
      code: 'code',
      expectedSubject: 'user_1',
      boundXnetDid: 'did:key:alice'
    })
    expect(result.verified).toBe(true)
    expect(result.subject).toBe('user_1')
  })

  it('rejects when the authenticated user differs from the enrolled subject', async () => {
    const anchor = new WorkOSRecoveryAnchor(makeProvider('user_2'))
    const result = await anchor.verifyCeremony({
      code: 'code',
      expectedSubject: 'user_1',
      boundXnetDid: 'did:key:alice'
    })
    expect(result.verified).toBe(false)
  })

  it('has kind "workos" (sibling of the atproto anchor)', () => {
    expect(new WorkOSRecoveryAnchor(makeProvider('u')).kind).toBe('workos')
  })
})
