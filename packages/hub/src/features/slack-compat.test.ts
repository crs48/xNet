/**
 * Tests for the Slack-compatibility feature (exploration 0198, Tiers 0 + 1):
 * incoming-webhook token auth + payload translation, and slash-command
 * signing-secret verification.
 */

import type { Env } from './broker'
import type { MiddlewareHandler } from 'hono'
import { signSlackRequest } from '@xnetjs/slack-compat'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { mountFeatures } from './registry'
import { slackCompatFeature, type SlackCompatPorts, type SlackDelivery } from './slack-compat'

const noopAuth: MiddlewareHandler = async (_c, next) => {
  await next()
}

function mount(ports: SlackCompatPorts, env: Env = {}): Hono {
  const app = new Hono()
  mountFeatures([slackCompatFeature(ports)], {
    app,
    env,
    requireAuth: noopAuth,
    storage: 'memory',
    dataDir: '/tmp/xnet-slack-test',
    appUrl: 'https://app.example'
  })
  return app
}

function basePorts(overrides: Partial<SlackCompatPorts> = {}): SlackCompatPorts {
  return {
    resolveHookToken: (token) => (token === 'good' ? { channelHint: '#default' } : null),
    deliverMessage: vi.fn(async () => {}),
    ...overrides
  }
}

describe('slack-compat — Tier 0 incoming webhook', () => {
  it('delivers a translated message for a known token', async () => {
    const delivered: SlackDelivery[] = []
    const app = mount(basePorts({ deliverMessage: async (d) => void delivered.push(d) }))

    const res = await app.request('/slack/services/hooks/good', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Build *failed*: <https://ci|logs>' })
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      token: 'good',
      content: 'Build **failed**: [logs](https://ci)',
      channelHint: '#default' // filled from the token context
    })
  })

  it('prefers an explicit channel in the payload over the token default', async () => {
    const delivered: SlackDelivery[] = []
    const app = mount(basePorts({ deliverMessage: async (d) => void delivered.push(d) }))
    await app.request('/slack/services/hooks/good', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', channel: '#ops' })
    })
    expect(delivered[0].channelHint).toBe('#ops')
  })

  it('404s an unknown token without delivering', async () => {
    const deliverMessage = vi.fn(async () => {})
    const app = mount(basePorts({ deliverMessage }))
    const res = await app.request('/slack/services/hooks/nope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' })
    })
    expect(res.status).toBe(404)
    expect(deliverMessage).not.toHaveBeenCalled()
  })

  it('400s an invalid JSON body', async () => {
    const app = mount(basePorts())
    const res = await app.request('/slack/services/hooks/good', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json'
    })
    expect(res.status).toBe(400)
  })
})

describe('slack-compat — Tier 1 slash commands', () => {
  const SECRET = 'sign-me'
  const body = 'command=%2Fdeploy&text=web&channel_id=C1'

  function signedHeaders(rawBody: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
    return {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': String(ts),
      'x-slack-signature': signSlackRequest({ signingSecret: secret, timestamp: ts, rawBody })
    }
  }

  it('verifies the signature and returns the handler response', async () => {
    const handleCommand = vi.fn(() => ({
      response_type: 'in_channel' as const,
      text: 'deploying web'
    }))
    const app = mount(basePorts({ handleCommand }), { SLACK_SIGNING_SECRET: SECRET })
    const res = await app.request('/slack/commands', {
      method: 'POST',
      headers: signedHeaders(body),
      body
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ response_type: 'in_channel', text: 'deploying web' })
    expect(handleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: '/deploy', text: 'web' })
    )
  })

  it('returns a default ephemeral reply when no handler is wired', async () => {
    const app = mount(basePorts(), { SLACK_SIGNING_SECRET: SECRET })
    const res = await app.request('/slack/commands', {
      method: 'POST',
      headers: signedHeaders(body),
      body
    })
    const json = (await res.json()) as { response_type: string; text: string }
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('/deploy')
  })

  it('401s a bad signature', async () => {
    const handleCommand = vi.fn()
    const app = mount(basePorts({ handleCommand }), { SLACK_SIGNING_SECRET: SECRET })
    const res = await app.request('/slack/commands', {
      method: 'POST',
      headers: signedHeaders(body, 'wrong-secret'),
      body
    })
    expect(res.status).toBe(401)
    expect(handleCommand).not.toHaveBeenCalled()
  })

  it('503s when the signing secret is not configured', async () => {
    const app = mount(basePorts(), {})
    const res = await app.request('/slack/commands', {
      method: 'POST',
      headers: signedHeaders(body),
      body
    })
    expect(res.status).toBe(503)
  })
})
