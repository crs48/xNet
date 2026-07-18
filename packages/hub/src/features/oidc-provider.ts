/**
 * @xnetjs/hub - Embedded OIDC provider (exploration 0338 Phase 3).
 *
 * When `config.identity.oidcProvider.enabled`, the hub becomes an OpenID
 * Connect provider for the org's *other* self-hosted apps (Grafana, Gitea, …) —
 * the `tsidp` pattern (Tailscale). "Hubs mint identity" done honestly: the hub
 * mints SESSIONS and id_tokens, never root keys. The login interaction is the
 * user's existing passkey unlock (handled by the app UI); subjects are
 * `pairwise` so cross-app correlation stays opt-in; claims come from the
 * `profile-<did>` node, including the verified ATProto handle.
 *
 * `node-oidc-provider` (panva, MIT) is the only certified OP that mounts
 * in-process in Node. It is a Koa app exposing a Node `(req,res)` callback; we
 * bridge that onto the hub's Hono app under `/oidc/*` using @hono/node-server's
 * raw request/response bindings. The dependency is loaded lazily so a hub with
 * the feature disabled never pays for it.
 *
 * SECURITY: refuses to mount when `auth` is disabled — an OIDC provider on top
 * of an open relay would issue tokens for an unauthenticated free-for-all.
 */

import type { HubConfig } from '../types'
import type { HubStorage } from '../storage/interface'
import type { Hono } from 'hono'

export interface OidcProviderDeps {
  app: Hono
  config: HubConfig
  storage: HubStorage
  /** Resolve a DID's profile claims (displayName, handle, verified atproto handle). */
  loadProfileClaims: (did: string) => Promise<{
    name?: string
    preferred_username?: string
  } | null>
}

export interface MountedOidcProvider {
  issuer: string
}

/**
 * Mount the embedded OIDC provider. Returns null (and mounts nothing) when the
 * feature is disabled. Throws when enabled but misconfigured (no publicUrl, or
 * auth disabled) — fail loud, don't half-start an identity provider.
 */
export async function mountOidcProvider(
  deps: OidcProviderDeps
): Promise<MountedOidcProvider | null> {
  const cfg = deps.config.identity?.oidcProvider
  if (!cfg?.enabled) return null

  if (!deps.config.auth) {
    throw new Error(
      'OIDC provider requires auth: true — refusing to issue tokens on an open relay (0338/0307)'
    )
  }
  const issuer = deps.config.publicUrl
  if (!issuer) {
    throw new Error('OIDC provider requires config.publicUrl (the issuer identifier)')
  }

  // Lazy import so disabled hubs never load Koa/oidc-provider. The package
  // ships no bundled types and is an optional dependency, so the specifier is
  // resolved dynamically to keep it off the hub's type/build graph.
  const specifier = 'oidc-provider'
  const mod = (await import(/* @vite-ignore */ specifier)) as unknown as {
    default: new (issuer: string, config: unknown) => OidcLike
  }
  const Provider = mod.default

  const provider = new Provider(issuer, {
    clients: cfg.clients ?? [],
    ...(cfg.jwks ? { jwks: cfg.jwks } : {}),
    subjectTypes: ['pairwise'],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false }
    },
    claims: {
      openid: ['sub'],
      profile: ['name', 'preferred_username']
    },
    async findAccount(_ctx: unknown, sub: string) {
      const claims = await deps.loadProfileClaims(sub)
      return {
        accountId: sub,
        async claims() {
          return { sub, ...(claims ?? {}) }
        }
      }
    }
  })

  provider.proxy = true
  const callback = provider.callback()

  // Bridge the Koa-style Node handler onto Hono under /oidc/*.
  deps.app.all('/oidc/*', async (c) => {
    const bindings = c.env as { incoming?: unknown; outgoing?: unknown }
    if (!bindings.incoming || !bindings.outgoing) {
      return c.text('OIDC provider requires the Node server runtime', 500)
    }
    await new Promise<void>((resolve, reject) => {
      try {
        callback(bindings.incoming, bindings.outgoing, resolve)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
    // The Koa callback writes the response directly to `outgoing`; return the
    // already-sent raw response so Hono doesn't double-write.
    return c.body(null)
  })

  return { issuer }
}

/** Minimal structural type for the bits of the Provider we use. */
interface OidcLike {
  proxy: boolean
  callback(): (req: unknown, res: unknown, next: () => void) => void
}
