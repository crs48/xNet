import { describe, expect, it, vi } from 'vitest'
import type { ActionEvent } from './define-action'
import { ActionDefinitionError, defineAction, shouldDispatch } from './define-action'
import { ActionSsrfError, assertPublicUrl } from './ssrf'
import { ActionDispatchError, guardedActionFetch, runAction } from './runner'
import {
  buildDiscordAction,
  buildEmailAction,
  buildSlackWebhookAction,
  buildTelegramAction,
  buildWebhookOutAction,
  renderEvent
} from './builtins'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'

const changeEvent: ActionEvent = {
  trigger: 'schema-change',
  change: 'update',
  node: { id: 'n1', schemaId: TASK, properties: { title: 'Ship it', status: 'done' } }
}

describe('defineAction', () => {
  it('rejects a bad id and a missing network grant', () => {
    expect(() =>
      defineAction({
        id: 'nope',
        name: 'x',
        capabilities: { network: ['x.com'] },
        trigger: { kind: 'manual' },
        dispatch: async () => {}
      })
    ).toThrow(ActionDefinitionError)
    expect(() =>
      defineAction({
        id: 'dev.xnet.action.x',
        name: 'x',
        capabilities: { network: [] },
        trigger: { kind: 'manual' },
        dispatch: async () => {}
      })
    ).toThrow(ActionDefinitionError)
  })

  it('builds a FeatureModule pointing at <id>.trigger', () => {
    const a = buildDiscordAction()
    expect(a.module.hub?.featureId).toBe('dev.xnet.action.discord.trigger')
    expect(a.module.capabilities?.network).toEqual(['discord.com'])
  })
})

describe('shouldDispatch', () => {
  it('matches schema-change triggers on the listed schema only', () => {
    expect(shouldDispatch({ kind: 'schema-change', schemas: [TASK] }, changeEvent)).toBe(true)
    expect(
      shouldDispatch(
        { kind: 'schema-change', schemas: ['xnet://xnet.fyi/Page@1.0.0'] },
        changeEvent
      )
    ).toBe(false)
    expect(shouldDispatch({ kind: 'manual' }, changeEvent)).toBe(false)
    expect(shouldDispatch({ kind: 'manual' }, { trigger: 'manual' })).toBe(true)
  })
})

describe('assertPublicUrl (SSRF guard)', () => {
  it('allows public https hosts', () => {
    expect(() => assertPublicUrl('https://discord.com/api/webhooks/1/abc')).not.toThrow()
  })
  it('blocks loopback, private, link-local, metadata, and non-http', () => {
    for (const bad of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.1.2.3/x',
      'http://172.16.5.4/x',
      'http://192.168.0.1/x',
      'http://169.254.169.254/latest/meta-data', // cloud metadata
      'http://metadata.google.internal/x',
      'http://[::1]/x',
      'http://box.local/x',
      'file:///etc/passwd',
      'https://[fd00::1]/x'
    ]) {
      expect(() => assertPublicUrl(bad), bad).toThrow(ActionSsrfError)
    }
  })
})

describe('guardedActionFetch', () => {
  const def = { id: 'dev.xnet.action.x', capabilities: { network: ['discord.com'] } }

  it('passes through an allowlisted public host', async () => {
    const inner = vi.fn(async () => ({ ok: true }))
    const fetch = guardedActionFetch(def, inner)
    await fetch('https://discord.com/api/webhooks/1/abc', { method: 'POST' })
    expect(inner).toHaveBeenCalledOnce()
  })

  it('blocks a host outside the allowlist', async () => {
    const inner = vi.fn()
    const fetch = guardedActionFetch(def, inner)
    await expect(fetch('https://evil.com/x')).rejects.toThrow()
    expect(inner).not.toHaveBeenCalled()
  })

  it('blocks an internal target even if allowlisted by host', async () => {
    const inner = vi.fn()
    const local = { id: 'dev.xnet.action.y', capabilities: { network: ['localhost'] } }
    const fetch = guardedActionFetch(local, inner)
    await expect(fetch('http://localhost/x')).rejects.toThrow(ActionSsrfError)
    expect(inner).not.toHaveBeenCalled()
  })
})

describe('built-in actions dispatch through runAction', () => {
  it('Discord posts { content } to the configured webhook URL', async () => {
    const calls: Array<{ url: string; init: unknown }> = []
    const fetch = vi.fn(async (url: unknown, init: unknown) => {
      calls.push({ url: String((url as { url?: string }).url ?? url), init })
      return { ok: true }
    })
    await runAction(buildDiscordAction(), changeEvent, {
      env: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' },
      fetch
    })
    expect(calls[0].url).toBe('https://discord.com/api/webhooks/1/abc')
    const body = JSON.parse((calls[0].init as { body: string }).body)
    expect(body.content).toContain('Ship it')
  })

  it('Discord throws a dispatch error when unconfigured', async () => {
    await expect(
      runAction(buildDiscordAction(), changeEvent, { env: {}, fetch: vi.fn() })
    ).rejects.toThrow(ActionDispatchError)
  })

  it('Telegram requires token + chat id', async () => {
    await expect(
      runAction(buildTelegramAction(), changeEvent, {
        env: { TELEGRAM_BOT_TOKEN: 't' },
        fetch: vi.fn()
      })
    ).rejects.toThrow(ActionDispatchError)
  })

  it('Slack posts { text }', async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: unknown) => ({ ok: true }))
    await runAction(buildSlackWebhookAction(), changeEvent, {
      env: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/x' },
      fetch
    })
    const body = JSON.parse((fetch.mock.calls[0][1] as { body: string }).body)
    expect(body.text).toContain('Ship it')
  })

  it('Email sends via Resend with a bearer token', async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: unknown) => ({ ok: true }))
    await runAction(
      buildEmailAction({ from: 'a@x.com', to: 'b@y.com', subject: 'Hi' }),
      changeEvent,
      { env: { RESEND_API_KEY: 'rk' }, fetch }
    )
    const init = fetch.mock.calls[0][1] as { headers: Record<string, string>; body: string }
    expect(init.headers.authorization).toBe('Bearer rk')
    expect(JSON.parse(init.body).subject).toBe('Hi')
  })

  it('webhook-out locks network to the URL host and posts the event', async () => {
    const action = buildWebhookOutAction({ url: 'https://hooks.zapier.com/abc' })
    expect(action.module.capabilities?.network).toEqual(['hooks.zapier.com'])
    const fetch = vi.fn(async (_url: unknown, _init?: unknown) => ({ ok: true }))
    await runAction(action, changeEvent, { env: {}, fetch })
    const body = JSON.parse((fetch.mock.calls[0][1] as { body: string }).body)
    expect(body.node.properties.title).toBe('Ship it')
  })

  it('surfaces a non-ok response as a dispatch error', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await expect(
      runAction(buildDiscordAction(), changeEvent, {
        env: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc' },
        fetch
      })
    ).rejects.toThrow(ActionDispatchError)
  })
})

describe('renderEvent', () => {
  it('summarizes node events and falls back for non-node events', () => {
    expect(renderEvent(changeEvent)).toContain('Ship it')
    expect(renderEvent({ trigger: 'schedule' })).toContain('schedule')
  })
})
