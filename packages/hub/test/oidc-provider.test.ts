/**
 * Embedded OIDC provider (0338 Phase 3): opt-in gating + safety guards.
 */
import type { HubConfig } from '../src/types'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mountOidcProvider } from '../src/features/oidc-provider'
import { createMemoryStorage } from '../src/storage/memory'

const baseConfig = (over: Partial<HubConfig> = {}): HubConfig =>
  ({
    port: 0,
    dataDir: './x',
    storage: 'memory',
    auth: true,
    maxMessageSize: 1,
    maxConnections: 1,
    defaultQuota: 1,
    maxBlobSize: 1,
    awarenessTtlMs: 1,
    awarenessCleanupIntervalMs: 1,
    awarenessMaxUsers: 1,
    awarenessMaxUpdateSize: 1,
    discoveryStaleTtlMs: 1,
    discoveryCleanupIntervalMs: 1,
    discoveryMaxPeers: 1,
    logLevel: 'error',
    publicUrl: 'https://hub.example.com',
    ...over
  }) as HubConfig

const deps = (config: HubConfig) => ({
  app: new Hono(),
  config,
  storage: createMemoryStorage(),
  loadProfileClaims: async () => ({ name: 'Ada' })
})

describe('mountOidcProvider', () => {
  it('mounts nothing and returns null when disabled', async () => {
    const result = await mountOidcProvider(deps(baseConfig()))
    expect(result).toBeNull()
  })

  it('refuses to mount on an open relay (auth disabled)', async () => {
    const config = baseConfig({ auth: false, identity: { oidcProvider: { enabled: true } } })
    await expect(mountOidcProvider(deps(config))).rejects.toThrow(/auth/)
  })

  it('requires a publicUrl (issuer)', async () => {
    const config = baseConfig({
      publicUrl: undefined,
      identity: { oidcProvider: { enabled: true } }
    })
    await expect(mountOidcProvider(deps(config))).rejects.toThrow(/publicUrl/)
  })

  it('mounts and reports the issuer when enabled + configured', async () => {
    const config = baseConfig({
      identity: {
        oidcProvider: {
          enabled: true,
          clients: [
            {
              client_id: 'grafana',
              client_secret: 'secret',
              redirect_uris: ['https://grafana.example.com/login/generic_oauth']
            }
          ]
        }
      }
    })
    const d = deps(config)
    const result = await mountOidcProvider(d)
    expect(result).not.toBeNull()
    expect(result?.issuer).toBe('https://hub.example.com')
    // The discovery document is served under the mounted /oidc/* prefix.
    const res = await d.app.request(
      '/oidc/.well-known/openid-configuration',
      {},
      {
        incoming: undefined,
        outgoing: undefined
      }
    )
    // Without the Node runtime bindings the bridge reports 500 — but the route
    // exists (not 404), proving the provider mounted.
    expect(res.status).not.toBe(404)
  })
})
