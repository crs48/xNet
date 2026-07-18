import { describe, expect, it, vi } from 'vitest'
import { MemoryBillingIdentityProvider } from './provider'
import { WorkOSAuthKitProvider } from './workos'

const config = {
  clientId: 'client_test',
  apiKey: 'sk_test',
  redirectUri: 'https://cloud.xnet.fyi/callback'
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

describe('WorkOSAuthKitProvider', () => {
  it('requires full config', () => {
    expect(() => new WorkOSAuthKitProvider({ clientId: '', apiKey: '', redirectUri: '' })).toThrow(
      /requires clientId/
    )
  })

  it('builds a hosted AuthKit authorization URL', () => {
    const p = new WorkOSAuthKitProvider(config)
    const url = new URL(p.getAuthorizationUrl({ state: 'xyz', screenHint: 'sign-up' }))
    expect(url.origin + url.pathname).toBe('https://api.workos.com/user_management/authorize')
    expect(url.searchParams.get('client_id')).toBe('client_test')
    expect(url.searchParams.get('provider')).toBe('authkit')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('https://cloud.xnet.fyi/callback')
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('screen_hint')).toBe('sign-up')
  })

  it('pins to an enterprise SSO connection when given (0338 Phase 4)', () => {
    const p = new WorkOSAuthKitProvider(config)
    const url = new URL(p.getAuthorizationUrl({ connectionId: 'conn_123' }))
    expect(url.searchParams.get('connection')).toBe('conn_123')
    // connection and provider are mutually exclusive.
    expect(url.searchParams.get('provider')).toBeNull()
  })

  it('pins to an organization when given', () => {
    const p = new WorkOSAuthKitProvider(config)
    const url = new URL(p.getAuthorizationUrl({ organizationId: 'org_456' }))
    expect(url.searchParams.get('organization')).toBe('org_456')
    expect(url.searchParams.get('provider')).toBeNull()
  })

  it('exchanges a code for a mapped billing user + tokens', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        client_id: 'client_test',
        client_secret: 'sk_test',
        grant_type: 'authorization_code',
        code: 'auth_code'
      })
      return jsonResponse({
        user: {
          id: 'user_01',
          email: 'a@b.com',
          email_verified: true,
          first_name: 'Ada',
          last_name: null
        },
        access_token: 'at',
        refresh_token: 'rt'
      })
    }) as unknown as typeof fetch

    const p = new WorkOSAuthKitProvider({ ...config, fetchImpl })
    const result = await p.authenticateWithCode('auth_code')
    expect(result.accessToken).toBe('at')
    expect(result.refreshToken).toBe('rt')
    expect(result.user).toEqual({
      id: 'user_01',
      email: 'a@b.com',
      emailVerified: true,
      firstName: 'Ada'
    })
  })

  it('throws on a failed authenticate', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'bad' }, 401)
    ) as unknown as typeof fetch
    const p = new WorkOSAuthKitProvider({ ...config, fetchImpl })
    await expect(p.authenticateWithCode('x')).rejects.toThrow(/WorkOS authenticate failed: 401/)
  })

  it('gets a user with a bearer key and maps 404 to null', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/user_management/users/user_01')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk_test')
      return jsonResponse({ id: 'user_01', email: 'a@b.com', email_verified: false })
    }) as unknown as typeof fetch
    const p = new WorkOSAuthKitProvider({ ...config, fetchImpl })
    expect(await p.getUser('user_01')).toEqual({
      id: 'user_01',
      email: 'a@b.com',
      emailVerified: false
    })

    const notFound = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const p2 = new WorkOSAuthKitProvider({ ...config, fetchImpl: notFound })
    expect(await p2.getUser('missing')).toBeNull()
  })
})

describe('MemoryBillingIdentityProvider', () => {
  it('redeems a seeded code once', async () => {
    const p = new MemoryBillingIdentityProvider()
    p.seed({ id: 'u1', email: 'u@x.com', emailVerified: true }, 'code123')
    const result = await p.authenticateWithCode('code123')
    expect(result.user.id).toBe('u1')
    await expect(p.authenticateWithCode('code123')).rejects.toThrow(/Invalid authorization code/)
  })

  it('looks up seeded users', async () => {
    const p = new MemoryBillingIdentityProvider()
    p.seed({ id: 'u1', email: 'u@x.com', emailVerified: true })
    expect(await p.getUser('u1')).toMatchObject({ id: 'u1' })
    expect(await p.getUser('nope')).toBeNull()
  })
})
