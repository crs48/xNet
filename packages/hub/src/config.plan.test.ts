import { resolveEntitlements, signEntitlements, withStorage } from '@xnetjs/entitlements'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig, resolveWritesEnabled } from './config'
import { readOnlyGuard } from './services/read-only'
import { DEFAULT_CONFIG } from './types'

const SECRET = 'hub-plan-secret'
const ENV_KEYS = ['HUB_PLAN', 'XNET_PLAN_SECRET', 'K_SERVICE', 'K_REVISION', 'GOOGLE_CLOUD_REGION']

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('resolveConfig — plan-aware quotas', () => {
  it('keeps DEFAULT_CONFIG limits when HUB_PLAN is absent (self-host)', () => {
    const config = resolveConfig({})
    expect(config.defaultQuota).toBe(DEFAULT_CONFIG.defaultQuota)
    expect(config.maxBlobSize).toBe(DEFAULT_CONFIG.maxBlobSize)
    expect(config.maxConnections).toBe(DEFAULT_CONFIG.maxConnections)
  })

  it('applies plan-driven quotas from a signed HUB_PLAN token (managed)', () => {
    const entitlements = withStorage(resolveEntitlements('personal'), 50 * 1024 * 1024 * 1024)
    process.env.HUB_PLAN = signEntitlements(entitlements, SECRET)
    process.env.XNET_PLAN_SECRET = SECRET

    const config = resolveConfig({})
    expect(config.defaultQuota).toBe(50 * 1024 * 1024 * 1024)
    expect(config.maxBlobSize).toBe(entitlements.maxBlobBytes)
    expect(config.maxConnections).toBe(entitlements.maxConnections)
  })

  it('throws on a HUB_PLAN with a missing secret', () => {
    process.env.HUB_PLAN = signEntitlements(resolveEntitlements('team'), SECRET)
    expect(() => resolveConfig({})).toThrow(/XNET_PLAN_SECRET is missing/)
  })
})

describe('resolveConfig — managed platform detection', () => {
  it('detects Cloud Run from K_SERVICE', () => {
    process.env.K_SERVICE = 'xnet-hub-alice'
    process.env.K_REVISION = 'xnet-hub-alice-00001'
    process.env.GOOGLE_CLOUD_REGION = 'us-central1'
    const config = resolveConfig({})
    expect(config.runtime?.platform).toBe('cloud-run')
    expect(config.runtime?.region).toBe('us-central1')
    expect(config.runtime?.machineId).toBe('xnet-hub-alice-00001')
  })
})

describe('resolveConfig — billing read-only (exploration 0418)', () => {
  it('leaves writesEnabled unset for a self-hosted hub', () => {
    // The anti-lock-in invariant (0174), asserted on the real config path: with
    // no HUB_PLAN there is no mechanism by which a hub nobody manages can be
    // told to stop accepting its owner's data.
    expect(resolveConfig({}).writesEnabled).toBeUndefined()
    expect(resolveWritesEnabled(resolveConfig({}))).toBe(true)
  })

  it('carries writesEnabled: false from a signed token', () => {
    process.env.HUB_PLAN = signEntitlements(
      { ...resolveEntitlements('personal'), writesEnabled: false },
      SECRET
    )
    process.env.XNET_PLAN_SECRET = SECRET
    expect(resolveWritesEnabled(resolveConfig({}))).toBe(false)
  })

  it('stays writable on an ordinary paid token', () => {
    process.env.HUB_PLAN = signEntitlements(resolveEntitlements('personal'), SECRET)
    process.env.XNET_PLAN_SECRET = SECRET
    expect(resolveWritesEnabled(resolveConfig({}))).toBe(true)
  })
})

describe('readOnlyGuard — real requests through a real Hono app', () => {
  const appFor = (writesEnabled: boolean) => {
    const app = new Hono()
    app.use(
      '*',
      readOnlyGuard(() => writesEnabled)
    )
    app.get('/changes', (c) => c.json({ ok: true }))
    app.post('/changes', (c) => c.json({ ok: true }))
    app.post('/query', (c) => c.json({ ok: true }))
    app.post('/billing/checkout', (c) => c.json({ ok: true }))
    app.get('/export/changes', (c) => c.json({ ok: true }))
    return app
  }

  it('is entirely transparent when writes are enabled', async () => {
    const app = appFor(true)
    expect((await app.request('/changes', { method: 'POST' })).status).toBe(200)
  })

  it('refuses a write with 507 and a machine-readable code', async () => {
    const res = await appFor(false).request('/changes', { method: 'POST' })
    expect(res.status).toBe(507)
    expect(await res.json()).toMatchObject({ code: 'billing_read_only' })
  })

  it('STILL SERVES READS — the whole point of the read-only rung', async () => {
    const res = await appFor(false).request('/changes')
    expect(res.status).toBe(200)
  })

  it('still serves POST-shaped reads', async () => {
    expect((await appFor(false).request('/query', { method: 'POST' })).status).toBe(200)
  })

  it('does not lock the customer out of the page that ends read-only', async () => {
    const res = await appFor(false).request('/billing/checkout', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('keeps the exit ramp open (Charter §6 vanish test)', async () => {
    expect((await appFor(false).request('/export/changes')).status).toBe(200)
  })
})
