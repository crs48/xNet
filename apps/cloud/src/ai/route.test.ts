import {
  FakeStripeBilling,
  MemoryUsageLedger,
  type ChatGateway,
  type ChatRequest,
  type ChatResult,
  type TokenPricing
} from '@xnetjs/cloud'
import { describe, expect, it } from 'vitest'
import { createAiRoute, type AiTenantContext } from './route'

const pricing: TokenPricing = { inputUsdPerMillion: 3, outputUsdPerMillion: 15, markup: 1.25 }

const fakeGateway = (tokens = { input: 1000, output: 500 }): ChatGateway => ({
  async chat(_req: ChatRequest): Promise<ChatResult> {
    return {
      text: 'hello',
      model: 'claude-sonnet',
      usage: {
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        totalTokens: tokens.input + tokens.output
      }
    }
  }
})

const tenant = (over: Partial<AiTenantContext> = {}): AiTenantContext => ({
  tenantId: 't1',
  virtualKey: 'sk-t1',
  customerId: 'cus_t1',
  budgetUsd: 25,
  includedUsd: 2,
  periodStartMs: 0,
  ...over
})

function makeApp(
  opts: { gateway?: ChatGateway; resolve?: AiTenantContext | null; allowedModels?: string[] } = {}
) {
  const ledger = new MemoryUsageLedger()
  const billing = new FakeStripeBilling()
  const app = createAiRoute({
    gateway: opts.gateway ?? fakeGateway(),
    ledger,
    billing,
    pricingFor: () => pricing,
    resolveTenant: async () => (opts.resolve === undefined ? tenant() : opts.resolve),
    ...(opts.allowedModels ? { allowedModels: opts.allowedModels } : {})
  })
  return { app, ledger, billing }
}

const post = (app: ReturnType<typeof makeApp>['app'], body: unknown) =>
  app.request('/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

const chatBody = (over: Record<string, unknown> = {}) => ({
  model: 'claude-sonnet',
  messages: [{ role: 'user', content: 'hi' }],
  sessionId: 's1',
  requestId: 'r1',
  ...over
})

describe('POST /ai/chat', () => {
  it('401s when the tenant cannot be resolved', async () => {
    const { app } = makeApp({ resolve: null })
    expect((await post(app, chatBody())).status).toBe(401)
  })

  it('400s on a missing model or empty messages', async () => {
    const { app } = makeApp()
    expect((await post(app, { messages: [] })).status).toBe(400)
    expect((await post(app, { model: 'x', messages: [] })).status).toBe(400)
  })

  it('400s when the model is not on the allow-list', async () => {
    const { app } = makeApp({ allowedModels: ['gpt-4o'] })
    const res = await post(app, chatBody({ model: 'claude-sonnet' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('model_not_allowed')
  })

  it('meters a successful call and returns spend-this-period', async () => {
    const { app, ledger, billing } = makeApp()
    const res = await post(app, chatBody())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.text).toBe('hello')
    expect(json.usage.inputTokens).toBe(1000)
    expect(json.spendThisPeriodUsd).toBeGreaterThan(0)
    expect(json.includedUsd).toBe(2)
    expect(json.budgetUsd).toBe(25)
    expect(json.budgetState).toBe('included') // small spend, well under included
    expect(await ledger.totalChargeUsd('t1')).toBeCloseTo(json.spendThisPeriodUsd, 8)
    expect(billing.events()).toHaveLength(1)
  })

  it('is idempotent: a redelivered (session, request) bills once', async () => {
    const { app, ledger, billing } = makeApp()
    await post(app, chatBody())
    await post(app, chatBody()) // same sessionId + requestId
    expect(billing.events()).toHaveLength(1)
    const entries = await ledger.entries('t1')
    expect(entries).toHaveLength(1)
  })

  it('402s with no provider call once over budget', async () => {
    let calls = 0
    const counting: ChatGateway = {
      async chat(r) {
        calls++
        return fakeGateway().chat(r)
      }
    }
    // budget below the cost of a single call → first call accrues, second is stopped
    const { app } = makeApp({ gateway: counting, resolve: tenant({ budgetUsd: 0.0001 }) })
    await post(app, chatBody({ requestId: 'r1' })) // accrues > budget
    const res = await post(app, chatBody({ requestId: 'r2' }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toBe('ai_budget_exceeded')
    expect(calls).toBe(1) // the second never reached the provider
  })
})
