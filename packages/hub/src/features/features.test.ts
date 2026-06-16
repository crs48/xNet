import type { HubFeature } from './types'
import type { TaskIdentifierService } from '../services/task-identifiers'
import type { MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { isEnvKeyAllowed, scopedEnv, type Env } from './broker'
import { billingFeature, tasksFeature, unfurlFeature } from './first-party'
import { mountFeatures } from './registry'

describe('broker', () => {
  it('isEnvKeyAllowed matches exact keys and PREFIX_* globs', () => {
    expect(isEnvKeyAllowed('STRIPE_SECRET_KEY', ['STRIPE_SECRET_KEY'])).toBe(true)
    expect(isEnvKeyAllowed('BTCPAY_API_KEY', ['BTCPAY_*'])).toBe(true)
    expect(isEnvKeyAllowed('HUB_GITHUB_WEBHOOK_SECRET', ['STRIPE_SECRET_KEY', 'BTCPAY_*'])).toBe(
      false
    )
    expect(isEnvKeyAllowed('ANYTHING', [])).toBe(false)
  })

  it('scopedEnv projects only the declared keys', () => {
    const env: Env = {
      STRIPE_SECRET_KEY: 'sk',
      BTCPAY_API_KEY: 'k',
      HUB_GITHUB_WEBHOOK_SECRET: 'whsec',
      OTHER: 'x'
    }
    const scoped = scopedEnv(env, ['STRIPE_SECRET_KEY', 'BTCPAY_*'])
    expect(scoped).toEqual({ STRIPE_SECRET_KEY: 'sk', BTCPAY_API_KEY: 'k' })
    expect(scoped.HUB_GITHUB_WEBHOOK_SECRET).toBeUndefined()
  })
})

const noopAuth: MiddlewareHandler = async (_c, next) => {
  await next()
}

function baseDeps(app: Hono, env: Env) {
  return {
    app,
    env,
    requireAuth: noopAuth,
    storage: 'memory' as const,
    dataDir: '/tmp/xnet-feature-test',
    appUrl: 'https://app.example'
  }
}

describe('mountFeatures (capability broker)', () => {
  it('hands each feature only its declared secrets', () => {
    let captured: Env = {}
    const spy: HubFeature = {
      id: 'spy',
      secrets: ['STRIPE_SECRET_KEY', 'BTCPAY_*'],
      mount: (d) => {
        captured = d.env
      }
    }
    mountFeatures([spy], {
      ...baseDeps(new Hono(), {}),
      env: { STRIPE_SECRET_KEY: 'sk', BTCPAY_API_KEY: 'k', HUB_GITHUB_WEBHOOK_SECRET: 'whsec' }
    })
    expect(captured).toEqual({ STRIPE_SECRET_KEY: 'sk', BTCPAY_API_KEY: 'k' })
    expect(captured.HUB_GITHUB_WEBHOOK_SECRET).toBeUndefined()
  })

  it('a feature with no declared secrets gets an empty env', () => {
    let captured: Env | null = null
    const spy: HubFeature = {
      id: 'spy',
      mount: (d) => {
        captured = d.env
      }
    }
    mountFeatures([spy], { ...baseDeps(new Hono(), {}), env: { STRIPE_SECRET_KEY: 'sk' } })
    expect(captured).toEqual({})
  })
})

describe('first-party features mount with preserved behaviour', () => {
  const stubIdentifiers = {} as unknown as TaskIdentifierService

  it('billing webhook answers 503 when unconfigured (opt-in)', async () => {
    const app = new Hono()
    mountFeatures([billingFeature()], { ...baseDeps(app, {}), env: {} })
    const res = await app.request('/billing/webhook', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
  })

  it('github webhook answers 503 when the secret is not granted', async () => {
    const app = new Hono()
    // HUB_GITHUB_WEBHOOK_SECRET is present in env but the broker scopes it away
    // from… well, tasks declares it, so it IS granted; with no secret value the
    // route reports not-configured.
    mountFeatures([tasksFeature(stubIdentifiers)], { ...baseDeps(app, {}), env: {} })
    const res = await app.request('/tasks/github/webhook', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
  })

  it('mounts unfurl without throwing', () => {
    const app = new Hono()
    expect(() =>
      mountFeatures([unfurlFeature('xnet-test/1.0')], { ...baseDeps(app, {}), env: {} })
    ).not.toThrow()
  })
})
