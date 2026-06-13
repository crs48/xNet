/**
 * WorkOS AuthKit wire-contract test.
 *
 * The unit tests in `workos.test.ts` inject `fetchImpl` to check field mapping.
 * This test runs the REAL provider with NO injection, so msw intercepts the actual
 * global `fetch` — exercising the true URL construction, headers, request body, and
 * error mapping against recorded fixtures of the WorkOS User Management API. WorkOS
 * ships no mock server, so msw + fixtures is the no-account contract test (0176).
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WorkOSAuthKitProvider } from './workos'

// Recorded fixture shapes from the WorkOS User Management API.
const userFixture = {
  id: 'user_01ABC',
  email: 'ada@example.com',
  email_verified: true,
  first_name: 'Ada',
  last_name: null
}

const server = setupServer(
  http.post('https://api.workos.com/user_management/authenticate', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    // Assert the real client sent the documented body shape.
    if (
      body.client_id !== 'client_test' ||
      body.client_secret !== 'sk_test' ||
      body.grant_type !== 'authorization_code'
    ) {
      return HttpResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    return HttpResponse.json({
      user: userFixture,
      access_token: 'access_tok',
      refresh_token: 'refresh_tok'
    })
  }),
  http.get('https://api.workos.com/user_management/users/:id', ({ request, params }) => {
    if (request.headers.get('authorization') !== 'Bearer sk_test') {
      return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (params.id !== userFixture.id) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(userFixture)
  })
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const provider = () =>
  new WorkOSAuthKitProvider({
    clientId: 'client_test',
    apiKey: 'sk_test',
    redirectUri: 'https://cloud.xnet.fyi/callback'
    // no fetchImpl — the real global fetch path is exercised, intercepted by msw
  })

describe('WorkOSAuthKitProvider wire contract (msw)', () => {
  it('authenticates with a code over real fetch and maps the response', async () => {
    const result = await provider().authenticateWithCode('the_code')
    expect(result.accessToken).toBe('access_tok')
    expect(result.refreshToken).toBe('refresh_tok')
    expect(result.user).toEqual({
      id: 'user_01ABC',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada'
    })
  })

  it('sends the bearer key on getUser and maps a hit', async () => {
    expect(await provider().getUser('user_01ABC')).toEqual({
      id: 'user_01ABC',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada'
    })
  })

  it('maps a 404 to null', async () => {
    expect(await provider().getUser('user_missing')).toBeNull()
  })

  it('throws on a non-2xx authenticate', async () => {
    server.use(
      http.post('https://api.workos.com/user_management/authenticate', () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 401 })
      )
    )
    await expect(provider().authenticateWithCode('bad')).rejects.toThrow(
      /WorkOS authenticate failed: 401/
    )
  })
})
