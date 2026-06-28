import { describe, expect, it, vi } from 'vitest'
import { isLowBalance, OpenRouterCreditsClient } from './credits'
import { VirtualKeyError } from './keys'

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('OpenRouterCreditsClient', () => {
  it('reads total/used and computes the remaining balance', async () => {
    const fetchImpl = jsonFetch({ data: { total_credits: 100, total_usage: 73.5 } })
    const client = new OpenRouterCreditsClient({ apiKey: 'sk-or', fetchImpl })
    const balance = await client.getBalance()
    expect(balance).toEqual({ totalCreditsUsd: 100, totalUsageUsd: 73.5, remainingUsd: 26.5 })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/credits')
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-or' })
  })

  it('defaults missing fields to zero', async () => {
    const client = new OpenRouterCreditsClient({ apiKey: 'k', fetchImpl: jsonFetch({}) })
    expect(await client.getBalance()).toEqual({
      totalCreditsUsd: 0,
      totalUsageUsd: 0,
      remainingUsd: 0
    })
  })

  it('throws on a non-2xx response', async () => {
    const client = new OpenRouterCreditsClient({ apiKey: 'k', fetchImpl: jsonFetch('', 403) })
    await expect(client.getBalance()).rejects.toBeInstanceOf(VirtualKeyError)
  })
})

describe('isLowBalance', () => {
  it('fires at or under the threshold', () => {
    const bal = { totalCreditsUsd: 100, totalUsageUsd: 95, remainingUsd: 5 }
    expect(isLowBalance(bal, 10)).toBe(true)
    expect(isLowBalance(bal, 5)).toBe(true)
    expect(isLowBalance(bal, 4.99)).toBe(false)
  })
})
