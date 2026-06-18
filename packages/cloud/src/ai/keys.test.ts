import { describe, expect, it, vi } from 'vitest'
import { FakeVirtualKeyManager, LiteLLMKeyManager, VirtualKeyError } from './keys'

describe('FakeVirtualKeyManager', () => {
  it('creates a deterministic key, updates the budget, and removes it', async () => {
    const m = new FakeVirtualKeyManager()
    const vk = await m.create({ alias: 't_abc', maxBudgetUsd: 25 })
    expect(vk.key).toBe('sk-fake-t_abc')
    expect(vk.maxBudgetUsd).toBe(25)

    await m.update(vk.key, { maxBudgetUsd: 60 })
    expect(m.list()[0]?.maxBudgetUsd).toBe(60)

    await m.remove(vk.key)
    expect(m.list()).toHaveLength(0)
  })
})

describe('LiteLLMKeyManager (over an injected fetch)', () => {
  it('POSTs /key/generate with the alias + budget and returns the key', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ key: 'sk-real-123' }), { status: 200 })
    ) as unknown as typeof fetch
    const m = new LiteLLMKeyManager({
      baseUrl: 'http://litellm:4000/',
      masterKey: 'sk-master',
      fetchImpl
    })

    const vk = await m.create({ alias: 't_xyz', maxBudgetUsd: 25, budgetDuration: '30d' })
    expect(vk.key).toBe('sk-real-123')

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://litellm:4000/key/generate') // trailing slash trimmed
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-master' })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ key_alias: 't_xyz', max_budget: 25, budget_duration: '30d' })
  })

  it('throws VirtualKeyError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 403 })
    ) as unknown as typeof fetch
    const m = new LiteLLMKeyManager({ baseUrl: 'http://litellm:4000', masterKey: 'k', fetchImpl })
    await expect(m.create({ alias: 't', maxBudgetUsd: 1 })).rejects.toBeInstanceOf(VirtualKeyError)
  })

  it('deletes via /key/delete with the key in an array', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 })
    ) as unknown as typeof fetch
    const m = new LiteLLMKeyManager({ baseUrl: 'http://litellm:4000', masterKey: 'k', fetchImpl })
    await m.remove('sk-real-123')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://litellm:4000/key/delete')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ keys: ['sk-real-123'] })
  })
})
