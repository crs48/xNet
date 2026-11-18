import type { DesktopSocialIdentity, DesktopSignInStatus } from '../../shared/onboarding'
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node'
import type { Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { NodeOAuthClient } from '@atproto/oauth-client-node'
import { oauthFetch } from './oauth-fetch'

const CALLBACK_PATH = '/oauth/bluesky/callback'
export const BLUESKY_NATIVE_REDIRECT = 'fyi.xnet:/oauth/callback'
const memoryStore = <T>() => {
  const values = new Map<string, T>()
  return {
    async set(key: string, value: T) {
      values.set(key, value)
    },
    async get(key: string) {
      return values.get(key)
    },
    async del(key: string) {
      values.delete(key)
    },
    clear() {
      values.clear()
    }
  }
}

export function normalizeBlueskyHandle(input: unknown): string {
  if (typeof input !== 'string') throw new Error('Enter your Bluesky handle.')
  const handle = input.trim().replace(/^@/, '').toLowerCase()
  if (
    handle.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(handle)
  )
    throw new Error('Enter a handle such as alice.bsky.social or your own domain.')
  return handle
}

/** One short-lived, identity-only ceremony. Tokens and PKCE/DPoP keys never leave main. */
export class DesktopBlueskySignIn {
  private active?: { abort: AbortController; server: Server; timer: ReturnType<typeof setTimeout> }
  private nativeCallback?: (params: URLSearchParams) => Promise<boolean>
  private status: DesktopSignInStatus = { phase: 'idle' }
  constructor(
    private readonly options: {
      development: boolean
      openExternal: (url: string) => Promise<void>
      linked: (identity: DesktopSocialIdentity) => void
      changed: () => void
    }
  ) {}
  snapshot(): DesktopSignInStatus {
    return { ...this.status }
  }
  private update(status: DesktopSignInStatus) {
    this.status = status
    this.options.changed()
  }
  cancel(): void {
    if (this.active) {
      this.active.abort.abort()
      clearTimeout(this.active.timer)
      if (this.active.server.listening) this.active.server.close()
      this.active.server.closeAllConnections()
      this.active = undefined
    }
    this.nativeCallback = undefined
    this.update({ phase: 'idle' })
  }
  async receiveCallback(rawUrl: string): Promise<void> {
    const url = new URL(rawUrl)
    if (
      rawUrl.length > 8192 ||
      rawUrl.split('?')[0] !== BLUESKY_NATIVE_REDIRECT ||
      url.host ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error('Invalid Bluesky sign-in callback.')
    if (!this.nativeCallback)
      throw new Error(
        'This sign-in is no longer open. Start again in xNet; your invitation is still saved.'
      )
    if (!(await this.nativeCallback(url.searchParams)))
      throw new Error('Unrecognized or already used Bluesky sign-in callback.')
  }
  async start(input: unknown): Promise<void> {
    const handle = normalizeBlueskyHandle(input)
    if (this.active) throw new Error('A sign-in is already open. Finish or cancel it first.')
    const abort = new AbortController()
    const server = createServer()
    const transaction = {
      abort,
      server,
      timer: setTimeout(() => {
        this.cancel()
        this.update({
          phase: 'error',
          message: 'Sign-in expired. Your invitation is still saved; try again.'
        })
      }, 10 * 60_000)
    }
    this.active = transaction
    this.update({ phase: 'preparing', handle })
    const stateStore = memoryStore<NodeSavedState>()
    const sessionStore = memoryStore<NodeSavedSession>()
    abort.signal.addEventListener(
      'abort',
      () => {
        stateStore.clear()
        sessionStore.clear()
      },
      { once: true }
    )
    try {
      if (this.options.development) {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(0, '127.0.0.1', resolve)
        })
      }
      const address = server.address()
      const origin =
        address && typeof address !== 'string' ? (`http://127.0.0.1:${address.port}` as const) : undefined
      if (this.options.development && !origin)
        throw new Error('Could not open the sign-in callback.')
      const redirectUri = origin ? (`${origin}${CALLBACK_PATH}` as const) : BLUESKY_NATIVE_REDIRECT
      const clientId = this.options.development
        ? `http://localhost?${new URLSearchParams({ redirect_uri: `http://127.0.0.1${CALLBACK_PATH}`, scope: 'atproto' })}`
        : 'https://xnet.fyi/oauth/atproto-desktop-client.json'
      const client = new NodeOAuthClient({
        clientMetadata: {
          client_id: clientId,
          client_name: 'xNet Desktop',
          application_type: 'native',
          redirect_uris: [redirectUri],
          scope: 'atproto',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          dpop_bound_access_tokens: true
        },
        handleResolver: 'https://bsky.social',
        fetch: oauthFetch,
        stateStore,
        sessionStore
      })
      const state = randomBytes(32).toString('hex')
      let handling = false
      const acceptCallback = async (
        params: URLSearchParams,
        reply: (status: number, message: string) => void
      ): Promise<boolean> => {
        const nonce = params.get('state')
        if (
          !nonce ||
          handling ||
          ['state', 'code', 'iss', 'error'].some((key) => params.getAll(key).length > 1)
        ) {
          reply(400, 'Invalid or already used sign-in callback.')
          return false
        }
        // Unrelated browser requests must not consume the legitimate ceremony.
        if (!(await stateStore.get(nonce)) || handling || this.active !== transaction) {
          reply(400, 'Unrecognized sign-in callback.')
          return false
        }
        handling = true
        try {
          this.update({ phase: 'verifying', handle })
          const result = await client.callback(params)
          if (result.state !== state) throw new Error('Sign-in state did not match.')
          abort.signal.throwIfAborted()
          const identity = await client.oauthResolver.resolveIdentity(result.session.did)
          if (identity.did !== result.session.did || identity.handle !== handle)
            throw new Error(
              'The authorized account did not match the requested handle. Try again with its current handle.'
            )
          const profileResponse = await oauthFetch(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(result.session.did)}`,
            { signal: abort.signal }
          )
          if (!profileResponse.ok)
            throw new Error('Signed in, but the profile could not be loaded. Please try again.')
          const profile = (await profileResponse.json()) as {
            did?: unknown
            displayName?: unknown
          }
          if (profile.did !== result.session.did)
            throw new Error('The profile identity did not match.')
          abort.signal.throwIfAborted()
          this.options.linked({
            provider: 'bluesky',
            subject: result.session.did,
            handle,
            displayName:
              typeof profile.displayName === 'string' ? profile.displayName.slice(0, 120) : handle,
            verifiedAt: Date.now()
          })
          reply(200, 'Bluesky connected to xNet. You can close this tab and return to the app.')
          // We only need proof of identity. Revoke the issued session before discarding its keys.
          // A revocation failure must be visible even though account verification succeeded.
          clearTimeout(transaction.timer)
          this.active = undefined
          this.nativeCallback = undefined
          if (server.listening) server.close()
          stateStore.clear()
          const connected: DesktopSignInStatus = { phase: 'connected', handle }
          this.update(connected)
          void client
            .revoke(result.session.did)
            .catch(() => {
              if (this.status === connected)
                this.update({
                  phase: 'connected',
                  handle,
                  message:
                    'Account connected. The temporary authorization could not be revoked; remove the temporary xNet authorization from Bluesky connected apps if desired. No access token is saved by xNet.'
                })
            })
            .finally(() => sessionStore.clear())
        } catch (cause) {
          reply(400, 'Sign-in could not be completed. Return to xNet to try again.')
          if (this.active === transaction) {
            this.cancel()
            this.update({
              phase: 'error',
              message:
                cause instanceof Error &&
                (cause.message.startsWith('The authorized account') ||
                  cause.message.startsWith('Disconnect the linked'))
                  ? cause.message
                  : 'Bluesky sign-in was declined or could not be verified. Your invitation is still saved. Please try again.'
            })
          }
        }
        return true
      }
      if (origin) {
        server.on('request', (request, response) => {
          const reply = (code: number, text: string) => {
            response.writeHead(code, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
              'Referrer-Policy': 'no-referrer',
              'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
              'X-Content-Type-Options': 'nosniff'
            })
            response.end(text)
          }
          let url: URL
          try {
            url = new URL(request.url ?? '/', origin)
          } catch {
            reply(400, 'Invalid sign-in callback.')
            return
          }
          if (
            request.method !== 'GET' ||
            request.headers.host !== new URL(origin).host ||
            url.pathname !== CALLBACK_PATH ||
            (request.url?.length ?? 0) > 8192
          ) {
            reply(400, 'Invalid sign-in callback.')
            return
          }
          void acceptCallback(url.searchParams, reply)
        })
      } else {
        this.nativeCallback = (params) => acceptCallback(params, () => {})
      }
      const url = await client.authorize(handle, {
        state,
        scope: 'atproto',
        redirect_uri: redirectUri,
        signal: abort.signal
      })
      abort.signal.throwIfAborted()
      this.update({ phase: 'waiting', handle })
      await this.options.openExternal(url.toString())
    } catch (cause) {
      if (this.active === transaction) {
        this.cancel()
        this.update({
          phase: 'error',
          message:
            'Could not start Bluesky sign-in. Check your handle and connection, then try again.'
        })
      }
      // Avoid propagating provider response bodies, authorization URLs or tokens to the renderer/logs.
      throw new Error(
        abort.signal.aborted
          ? 'Sign-in stopped. Your invitation is still saved.'
          : 'Could not start Bluesky sign-in.'
      )
    }
  }
}
