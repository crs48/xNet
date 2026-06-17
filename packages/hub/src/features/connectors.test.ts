import type { Env } from './broker'
import type { MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { connectorSyncFeature, type ConnectorSyncRunInput } from './connectors'
import { mountFeatures } from './registry'

const authAs =
  (did: string): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did, can: () => true })
    await next()
  }

const noAuth: MiddlewareHandler = async (_c, next) => {
  await next()
}

function baseDeps(app: Hono, env: Env, requireAuth: MiddlewareHandler) {
  return {
    app,
    env,
    requireAuth,
    storage: 'memory' as const,
    dataDir: '/tmp/xnet-connector-test',
    appUrl: 'https://app.example'
  }
}

describe('connectorSyncFeature', () => {
  it('mounts at /x/<id>.sync and runs one pass with subject + space + scoped env', async () => {
    const seen: ConnectorSyncRunInput[] = []
    const feature = connectorSyncFeature({
      id: 'dev.xnet.connector.slack',
      secrets: ['SLACK_BOT_TOKEN'],
      run: async (input) => {
        seen.push(input)
        return { written: 2 }
      }
    })

    const app = new Hono()
    mountFeatures([feature], {
      ...baseDeps(
        app,
        { SLACK_BOT_TOKEN: 'xoxb', HUB_GITHUB_WEBHOOK_SECRET: 'whsec' },
        authAs('did:key:alice')
      )
    })

    const res = await app.request('/x/dev.xnet.connector.slack.sync/run', {
      method: 'POST',
      body: JSON.stringify({ space: 'space-A' }),
      headers: { 'content-type': 'application/json' }
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, result: { written: 2 } })
    expect(seen).toHaveLength(1)
    expect(seen[0].subject).toBe('did:key:alice')
    expect(seen[0].space).toBe('space-A')
    // Broker scoped the env: the connector's run sees only its declared secret.
    expect(seen[0].env).toEqual({ SLACK_BOT_TOKEN: 'xoxb' })
    expect(seen[0].env.HUB_GITHUB_WEBHOOK_SECRET).toBeUndefined()
  })

  it('rejects an unauthenticated caller with 401', async () => {
    const feature = connectorSyncFeature({ id: 'dev.xnet.connector.slack', run: async () => ({}) })
    const app = new Hono()
    mountFeatures([feature], { ...baseDeps(app, {}, noAuth) })
    const res = await app.request('/x/dev.xnet.connector.slack.sync/run', {
      method: 'POST',
      body: '{}'
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 with the error message when the sync throws', async () => {
    const feature = connectorSyncFeature({
      id: 'dev.xnet.connector.slack',
      run: async () => {
        throw new Error('rate limited')
      }
    })
    const app = new Hono()
    mountFeatures([feature], { ...baseDeps(app, {}, authAs('did:key:bob')) })
    const res = await app.request('/x/dev.xnet.connector.slack.sync/run', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' }
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'rate limited' })
  })
})
