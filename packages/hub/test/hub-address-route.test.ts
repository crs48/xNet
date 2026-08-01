/**
 * `GET /.well-known/xnet-hub-address` (exploration 0423).
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadOrCreateHubIdentity } from '../src/hub-identity'
import { HUB_ADDRESS_PATH, createHubAddressRoutes } from '../src/routes/hub-address'
import { verifyHubAddress, type HubAddressRecord } from '../src/services/hub-address'

describe('hub address route', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'xnet-hub-address-'))
  })
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('serves a record signed by this hub, naming this hub', async () => {
    const identity = loadOrCreateHubIdentity(dataDir)
    const app = createHubAddressRoutes(identity, { url: 'https://hub.example', now: () => 1_000 })

    const res = await app.request('/')
    expect(res.status).toBe(200)
    const record = (await res.json()) as HubAddressRecord

    expect(record.did).toBe(identity.did)
    expect(record.hubDid).toBe(identity.did)
    expect(record.url).toBe('https://hub.example')
    expect(record.status).toBe('ready')
    expect(record.validUntil).toBeGreaterThan(record.issuedAt)
    expect(verifyHubAddress(record)).toBe(true)
  })

  it('is cacheable for exactly the record lifetime', async () => {
    const identity = loadOrCreateHubIdentity(dataDir)
    const app = createHubAddressRoutes(identity, { url: 'https://hub.example', ttlMs: 120_000 })

    const res = await app.request('/')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120')
  })

  it('includes fallbacks under the signature when configured', async () => {
    const identity = loadOrCreateHubIdentity(dataDir)
    const app = createHubAddressRoutes(identity, {
      url: 'https://hub.example',
      fallbacks: ['http://hub.local:3030']
    })

    const record = (await (await app.request('/')).json()) as HubAddressRecord
    expect(record.fallbacks).toEqual(['http://hub.local:3030'])
    expect(verifyHubAddress(record)).toBe(true)
    expect(verifyHubAddress({ ...record, fallbacks: ['https://attacker.example'] })).toBe(false)
  })

  it('fails loudly when the hub has no public URL, rather than publishing an empty one', async () => {
    const identity = loadOrCreateHubIdentity(dataDir)
    const app = createHubAddressRoutes(identity, { url: '' })

    const res = await app.request('/')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'NO_PUBLIC_URL' })
  })

  it('signs a stable identity across restarts', async () => {
    const first = loadOrCreateHubIdentity(dataDir)
    const second = loadOrCreateHubIdentity(dataDir)
    expect(second.did).toBe(first.did)

    const app = createHubAddressRoutes(second, { url: 'https://hub.example' })
    const record = (await (await app.request('/')).json()) as HubAddressRecord
    expect(record.hubDid).toBe(first.did)
  })

  it('exposes the well-known path as a constant so mounts cannot drift', () => {
    expect(HUB_ADDRESS_PATH).toBe('/.well-known/xnet-hub-address')
  })
})
