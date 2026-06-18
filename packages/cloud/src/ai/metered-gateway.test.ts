import type { ChatGateway, ChatRequest, ChatResult } from './gateway'
import { describe, expect, it } from 'vitest'
import { FakeStripeBilling, MemoryUsageLedger, type TokenPricing } from '../billing'
import { BudgetExceededError, MeteredGateway } from './metered-gateway'
import { meterUsage } from './metering'

const pricing: TokenPricing = { inputUsdPerMillion: 3, outputUsdPerMillion: 15, markup: 1.3 }

// A fake gateway that returns fixed usage — no network, no provider key.
const fakeGateway = (usageTokens = { input: 1000, output: 500 }): ChatGateway => ({
  async chat(_req: ChatRequest): Promise<ChatResult> {
    return {
      text: 'ok',
      model: 'gpt-4o',
      usage: {
        inputTokens: usageTokens.input,
        outputTokens: usageTokens.output,
        totalTokens: usageTokens.input + usageTokens.output
      }
    }
  }
})

function makeMetered(budgetUsd: number, gateway = fakeGateway()) {
  const ledger = new MemoryUsageLedger()
  const billing = new FakeStripeBilling()
  const mg = new MeteredGateway({
    gateway,
    ledger,
    billing,
    pricingFor: () => pricing,
    budgetUsdFor: async () => budgetUsd,
    customerIdFor: (t) => `cus_${t}`
  })
  return { mg, ledger, billing }
}

const req = (): ChatRequest => ({
  virtualKey: 'sk-t1',
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hi' }]
})

describe('meterUsage', () => {
  it('records usage and emits one meter event, idempotently', async () => {
    const ledger = new MemoryUsageLedger()
    const billing = new FakeStripeBilling()
    const args = {
      tenantId: 't1',
      customerId: 'cus_t1',
      key: 't1:s1:r1',
      model: 'gpt-4o',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      pricing,
      ledger,
      billing
    }
    const first = await meterUsage(args)
    expect(first.recorded).toBe(true)
    expect(first.chargeUsd).toBeCloseTo(0.01365, 8)

    const second = await meterUsage(args) // retry with same key
    expect(second.recorded).toBe(false)
    // ledger counted once, exactly one meter event emitted
    expect(await ledger.totalChargeUsd('t1')).toBeCloseTo(0.01365, 8)
    expect(billing.events()).toHaveLength(1)
    expect(billing.total('ai_usage_usd', 'cus_t1')).toBeCloseTo(0.01365, 8)
  })
})

describe('MeteredGateway budget hard-stop', () => {
  it('meters a call and accrues spend in the ledger', async () => {
    const { mg, ledger, billing } = makeMetered(1)
    await mg.chat({ tenantId: 't1', key: 't1:s:1', request: req() })
    expect(await ledger.totalChargeUsd('t1')).toBeGreaterThan(0)
    expect(billing.events()).toHaveLength(1)
  })

  it('scopes the budget check to the current period (last period does not count)', async () => {
    let calls = 0
    const counting: ChatGateway = {
      async chat(r) {
        calls++
        return fakeGateway().chat(r)
      }
    }
    const ledger = new MemoryUsageLedger()
    // A big charge in the PREVIOUS period (timestamp before the period start).
    await meterUsage({
      tenantId: 't1',
      customerId: 'cus_t1',
      key: 'last-period',
      model: 'gpt-4o',
      usage: { inputTokens: 10_000_000, outputTokens: 5_000_000, totalTokens: 15_000_000 },
      pricing,
      ledger,
      billing: new FakeStripeBilling(),
      timestampMs: 1_000
    })
    const mg = new MeteredGateway({
      gateway: counting,
      ledger,
      billing: new FakeStripeBilling(),
      pricingFor: () => pricing,
      budgetUsdFor: async () => 0.5,
      customerIdFor: (t) => `cus_${t}`,
      periodStartMsFor: async () => 100_000 // this period starts after the old charge
    })
    // Over the all-time budget, but THIS period is empty → the call goes through.
    await mg.chat({ tenantId: 't1', key: 't1:s:now', request: req() })
    expect(calls).toBe(1)
  })

  it('hard-stops (no provider call) once accrued spend reaches the budget', async () => {
    // Budget is tiny; one expensive call pushes spend over it.
    const expensive = fakeGateway({ input: 10_000_000, output: 5_000_000 })
    const { mg } = makeMetered(0.001, expensive)
    await mg.chat({ tenantId: 't1', key: 't1:s:1', request: req() }) // accrues >> budget

    let calls = 0
    const counting: ChatGateway = {
      async chat(r) {
        calls++
        return expensive.chat(r)
      }
    }
    const ledger = new MemoryUsageLedger()
    // Seed the ledger so the tenant is already over budget.
    await meterUsage({
      tenantId: 't1',
      customerId: 'cus_t1',
      key: 'seed',
      model: 'gpt-4o',
      usage: { inputTokens: 10_000_000, outputTokens: 5_000_000, totalTokens: 15_000_000 },
      pricing,
      ledger,
      billing: new FakeStripeBilling()
    })
    const mg2 = new MeteredGateway({
      gateway: counting,
      ledger,
      billing: new FakeStripeBilling(),
      pricingFor: () => pricing,
      budgetUsdFor: async () => 0.001,
      customerIdFor: (t) => `cus_${t}`
    })
    await expect(
      mg2.chat({ tenantId: 't1', key: 't1:s:2', request: req() })
    ).rejects.toBeInstanceOf(BudgetExceededError)
    expect(calls).toBe(0) // never reached the provider
  })
})
