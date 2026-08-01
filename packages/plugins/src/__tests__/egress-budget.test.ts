import { isTagged } from '@xnetjs/core'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EGRESS_BUDGET_BYTES,
  EgressBudgetError,
  EgressMeter,
  measureBytes
} from '../ai-surface/egress-budget'

const rows = (n: number) => ({ rows: Array.from({ length: n }, (_, i) => ({ id: i, body: 'x'.repeat(100) })) })

describe('egress budget (exploration 0416)', () => {
  it('meters read tools and ignores write tools', () => {
    const meter = new EgressMeter()
    expect(meter.meters('xnet_query')).toBe(true)
    expect(meter.meters('xnet_get')).toBe(true)
    expect(meter.meters('xnet_apply_page_markdown')).toBe(false)
  })

  it('accumulates spend across calls within a session', () => {
    const meter = new EgressMeter()
    meter.charge('xnet_query', rows(5))
    const afterFirst = meter.spentBytes
    expect(afterFirst).toBeGreaterThan(0)

    meter.charge('xnet_query', rows(5))
    expect(meter.spentBytes).toBeGreaterThan(afterFirst)
    expect(meter.remainingBytes).toBe(DEFAULT_EGRESS_BUDGET_BYTES - meter.spentBytes)
  })

  it('does not charge for unmetered tools', () => {
    const meter = new EgressMeter()
    meter.charge('xnet_apply_page_markdown', rows(50))
    expect(meter.spentBytes).toBe(0)
  })

  it('throws a typed error rather than truncating', () => {
    const meter = new EgressMeter({ budgetBytes: 200 })
    let caught: unknown
    try {
      meter.charge('xnet_query', rows(50))
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(EgressBudgetError)
    expect(isTagged(caught, 'EgressBudgetError')).toBe(true)
    expect((caught as EgressBudgetError).budgetBytes).toBe(200)
    expect((caught as EgressBudgetError).tool).toBe('xnet_query')
    // The message must rule out the "that was all the data" reading.
    expect((caught as Error).message).toMatch(/NOT truncated/)
  })

  it('leaves spend unchanged when a call is refused', () => {
    const meter = new EgressMeter({ budgetBytes: 500 })
    meter.charge('xnet_query', rows(1))
    const spentBefore = meter.spentBytes

    expect(() => meter.charge('xnet_query', rows(50))).toThrow(EgressBudgetError)
    expect(meter.spentBytes).toBe(spentBefore)
  })

  it('allows a read that exactly fills the budget', () => {
    const payload = 'x'.repeat(100)
    const size = measureBytes(payload)
    const meter = new EgressMeter({ budgetBytes: size })
    expect(() => meter.charge('xnet_query', payload)).not.toThrow()
    expect(meter.remainingBytes).toBe(0)
  })

  it('meters strings and objects, and tolerates unserializable results', () => {
    expect(measureBytes('hello')).toBe(5)
    expect(measureBytes({ a: 1 })).toBe('{"a":1}'.length)
    expect(measureBytes(null)).toBe(0)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(measureBytes(cyclic)).toBe(0)
  })

  it('honours a custom metered-tool set', () => {
    const meter = new EgressMeter({ meteredTools: new Set(['custom_read']) })
    expect(meter.meters('custom_read')).toBe(true)
    expect(meter.meters('xnet_query')).toBe(false)
  })
})
