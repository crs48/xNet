import { readFileSync } from 'node:fs'
import { get } from 'node:http'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BLUESKY_NATIVE_REDIRECT, DesktopBlueskySignIn, normalizeBlueskyHandle } from './bluesky'

const mock = vi.hoisted(() => ({
  redirect: '',
  state: '',
  subject: 'did:plc:alice',
  resolvedHandle: 'alice.test',
  metadata: vi.fn(),
  callback: vi.fn(),
  revoke: vi.fn(),
  authorize: vi.fn(),
  profileDid: 'did:plc:alice'
}))
vi.mock('@atproto/oauth-client-node', () => ({
  NodeOAuthClient: class {
    oauthResolver = {
      resolveIdentity: async (did: string) => ({ did, handle: mock.resolvedHandle })
    }
    constructor(
      private readonly options: {
        clientMetadata: unknown
        stateStore: { set: (key: string, value: unknown) => Promise<void> }
      }
    ) {
      mock.metadata(options.clientMetadata)
    }
    async authorize(
      _handle: string,
      options: { state: string; redirect_uri: string; scope: string }
    ) {
      mock.authorize(options)
      mock.state = options.state
      mock.redirect = options.redirect_uri
      await this.options.stateStore.set('sdk-nonce', {})
      return new URL('https://bsky.social/oauth/authorize')
    }
    async callback(params: URLSearchParams) {
      mock.callback(params)
      if (params.has('error')) throw new Error('access_denied')
      return { state: mock.state, session: { did: mock.subject } }
    }
    async revoke() {
      return mock.revoke()
    }
  }
}))
vi.mock('./oauth-fetch', () => ({
  oauthFetch: async () => Response.json({ did: mock.profileDid, displayName: 'Alice' })
}))
const ceremonies: DesktopBlueskySignIn[] = []
const setup = async (development = true) => {
  const linked = vi.fn(),
    openExternal = vi.fn(async () => {})
  const signIn = new DesktopBlueskySignIn({
    development,
    openExternal,
    linked,
    changed: () => {}
  })
  ceremonies.push(signIn)
  await signIn.start('@alice.test')
  return { signIn, linked, openExternal }
}
const callback = (
  query = 'state=sdk-nonce&code=code&iss=https%3A%2F%2Fbsky.social',
  headers?: HeadersInit
) => fetch(`${mock.redirect}?${query}`, { headers })
beforeEach(() => {
  vi.clearAllMocks()
  mock.subject = 'did:plc:alice'
  mock.resolvedHandle = 'alice.test'
  mock.profileDid = 'did:plc:alice'
})
afterEach(() => {
  vi.useRealTimers()
  for (const ceremony of ceremonies.splice(0)) ceremony.cancel()
})

it('opens external identity-only OAuth and records only the verified public profile', async () => {
  const { signIn, linked, openExternal } = await setup()
  expect(openExternal).toHaveBeenCalledWith('https://bsky.social/oauth/authorize')
  expect(mock.authorize.mock.calls[0][0].scope).toBe('atproto')
  expect(signIn.snapshot().phase).toBe('waiting')
  const response = await callback()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(linked).toHaveBeenCalledOnce()
  expect(linked.mock.calls[0][0]).toEqual({
    provider: 'bluesky',
    subject: 'did:plc:alice',
    handle: 'alice.test',
    displayName: 'Alice',
    verifiedAt: expect.any(Number)
  })
  expect(signIn.snapshot().phase).toBe('connected')
  expect(mock.revoke).toHaveBeenCalledOnce()
})
it('rejects unsolicited callbacks and DNS rebinding Host headers without consuming the ceremony', async () => {
  const { linked, signIn } = await setup()
  expect((await callback('state=foreign&code=code')).status).toBe(400)
  const rebound = await new Promise<number | undefined>((resolve, reject) => {
    get(
      `${mock.redirect}?state=sdk-nonce&code=code`,
      { headers: { Host: 'attacker.test' } },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      }
    ).on('error', reject)
  })
  expect(rebound).toBe(400)
  expect((await callback('state=sdk-nonce&state=duplicate&code=code')).status).toBe(400)
  expect(mock.callback).not.toHaveBeenCalled()
  expect(linked).not.toHaveBeenCalled()
  expect(signIn.snapshot().phase).toBe('waiting')
  expect((await callback()).status).toBe(200)
})
it('does not link a different account or an unverified handle', async () => {
  const { linked, signIn } = await setup()
  mock.resolvedHandle = 'mallory.test'
  expect((await callback()).status).toBe(400)
  expect(linked).not.toHaveBeenCalled()
  expect(signIn.snapshot().phase).toBe('error')
})
it('does not accept profile data for a different DID', async () => {
  const { linked } = await setup()
  mock.profileDid = 'did:plc:mallory'
  expect((await callback()).status).toBe(400)
  expect(linked).not.toHaveBeenCalled()
})
it('handles denial and cancellation without leaving a callback listener', async () => {
  const { linked, signIn } = await setup()
  expect((await callback('state=sdk-nonce&error=access_denied')).status).toBe(400)
  expect(signIn.snapshot().phase).toBe('error')
  expect(linked).not.toHaveBeenCalled()
  const second = await setup()
  second.signIn.cancel()
  await expect(callback()).rejects.toThrow()
  expect(second.signIn.snapshot().phase).toBe('idle')
})
it('refuses URLs, local addresses and ambiguous handle input', () => {
  for (const value of [
    'https://alice.test',
    'localhost',
    '127.0.0.1',
    'alice.test/path',
    'a'.repeat(254),
    null
  ])
    expect(() => normalizeBlueskyHandle(value)).toThrow()
  expect(normalizeBlueskyHandle(' @Alice.Test ')).toBe('alice.test')
})

it('uses the registered native callback in production, rejects foreign and replayed callbacks', async () => {
  const { signIn, linked } = await setup(false)
  const published = JSON.parse(
    readFileSync(
      new URL('../../../../../site/public/oauth/atproto-desktop-client.json', import.meta.url),
      'utf8'
    )
  )
  expect(mock.redirect).toBe(BLUESKY_NATIVE_REDIRECT)
  expect(mock.metadata.mock.calls[0][0]).toMatchObject({
    client_id: published.client_id,
    redirect_uris: published.redirect_uris,
    application_type: 'native',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true
  })
  for (const url of [
    'https://attacker.test/oauth/callback?state=sdk-nonce',
    'fyi.xnet://attacker/oauth/callback?state=sdk-nonce',
    'fyi.xnet:/oauth/callback?state=foreign',
    'fyi.xnet:/oauth/callback?state=sdk-nonce&state=other',
    'fyi.xnet:/oauth/callback?state=sdk-nonce#fragment'
  ])
    await expect(signIn.receiveCallback(url)).rejects.toThrow()
  expect(linked).not.toHaveBeenCalled()
  expect(signIn.snapshot().phase).toBe('waiting')
  const url = `${BLUESKY_NATIVE_REDIRECT}?state=sdk-nonce&code=code&iss=https%3A%2F%2Fbsky.social`
  await signIn.receiveCallback(url)
  expect(linked).toHaveBeenCalledOnce()
  await expect(signIn.receiveCallback(url)).rejects.toThrow('no longer open')
})
it('discards native callback transactions on cancel and expiry', async () => {
  vi.useFakeTimers()
  const { signIn, linked } = await setup(false)
  const url = `${BLUESKY_NATIVE_REDIRECT}?state=sdk-nonce&code=code`
  signIn.cancel()
  await expect(signIn.receiveCallback(url)).rejects.toThrow('no longer open')
  await signIn.start('alice.test')
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(signIn.snapshot().phase).toBe('error')
  await expect(signIn.receiveCallback(url)).rejects.toThrow('no longer open')
  expect(linked).not.toHaveBeenCalled()
})
it('does not restore a disconnected status when an older token revocation fails', async () => {
  let failRevocation!: (error: Error) => void
  mock.revoke.mockReturnValueOnce(
    new Promise((_, reject) => {
      failRevocation = reject
    })
  )
  const { signIn } = await setup(false)
  await signIn.receiveCallback(`${BLUESKY_NATIVE_REDIRECT}?state=sdk-nonce&code=code`)
  expect(signIn.snapshot().phase).toBe('connected')
  signIn.cancel()
  failRevocation(new Error('Offline'))
  await new Promise((resolve) => setImmediate(resolve))
  expect(signIn.snapshot().phase).toBe('idle')
})
