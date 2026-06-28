import { describe, expect, it, vi } from 'vitest'
import { VirtualKeyError } from './keys'
import { OpenRouterKeyManager } from './openrouter-keys'

describe('OpenRouterKeyManager (over an injected fetch)', () => {
  it('POSTs /keys with a monthly limit and returns key + hash as manageId', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'sk-or-secret-123', data: { hash: 'hash-abc' } }), {
          status: 201
        })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({
      managementKey: 'sk-or-mgmt',
      baseUrl: 'https://openrouter.ai/api/v1/',
      fetchImpl
    })

    const vk = await m.create({ alias: 't_acme', maxBudgetUsd: 25, budgetDuration: '30d' })
    expect(vk.key).toBe('sk-or-secret-123')
    expect(vk.manageId).toBe('hash-abc') // hash, not the secret
    expect(vk.maxBudgetUsd).toBe(25)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/keys') // trailing slash trimmed
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-or-mgmt' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 't_acme',
      limit: 25,
      limit_reset: 'monthly'
    })
  })

  it('honors a weekly limit_reset on create', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'sk-or-secret-123', data: { hash: 'hash-abc' } }), {
          status: 201
        })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({ managementKey: 'k', fetchImpl })
    await m.create({ alias: 't_acme', maxBudgetUsd: 25, limitReset: 'weekly' })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 't_acme',
      limit: 25,
      limit_reset: 'weekly'
    })
  })

  it('PATCHes limit_reset (and/or limit) on update', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({
      managementKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    await m.update('hash-abc', { maxBudgetUsd: 60, limitReset: 'weekly' })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      limit: 60,
      limit_reset: 'weekly'
    })
  })

  it('throws when the create response is missing key or hash', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ key: 'sk-or-only' }), { status: 201 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({ managementKey: 'k', fetchImpl })
    await expect(m.create({ alias: 't', maxBudgetUsd: 1 })).rejects.toBeInstanceOf(VirtualKeyError)
  })

  it('PATCHes the budget by hash', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({
      managementKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    await m.update('hash-abc', { maxBudgetUsd: 60 })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/keys/hash-abc')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ limit: 60 })
  })

  it('is a no-op update when no budget is supplied', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({ managementKey: 'k', fetchImpl })
    await m.update('hash-abc', {})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reads a key’s usage via GET /keys/{hash}', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { usage: 7.5, limit: 25, limit_remaining: 17.5 } }), {
          status: 200
        })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({
      managementKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    expect(await m.usage('hash-abc')).toEqual({
      usageUsd: 7.5,
      limitUsd: 25,
      limitRemainingUsd: 17.5
    })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/keys/hash-abc')
    expect((init as RequestInit).method).toBe('GET')
  })

  it('DELETEs by hash', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({
      managementKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    await m.remove('hash-abc')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/keys/hash-abc')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  it('throws VirtualKeyError on a non-2xx admin response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('forbidden', { status: 403 })
    ) as unknown as typeof fetch
    const m = new OpenRouterKeyManager({ managementKey: 'k', fetchImpl })
    await expect(m.create({ alias: 't', maxBudgetUsd: 1 })).rejects.toBeInstanceOf(VirtualKeyError)
  })
})
