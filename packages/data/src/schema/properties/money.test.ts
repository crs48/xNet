import { describe, expect, it } from 'vitest'
import { money, isMoneyValue } from './money'

describe('money() property (0187)', () => {
  it('serializes via the json storage path with a money format marker', () => {
    const p = money({})
    expect(p.definition.type).toBe('json')
    expect(p.definition.config).toMatchObject({ format: 'money' })
    expect(p.definition.required).toBe(false)
  })

  it('accepts integer minor units with an ISO-4217 code', () => {
    const p = money({})
    expect(p.validate({ amount: 1234, currency: 'USD' })).toBe(true)
    expect(p.validate({ amount: -4000, currency: 'EUR' })).toBe(true)
    expect(p.validate({ amount: 500, currency: 'JPY' })).toBe(true)
    expect(p.validate({ amount: 0, currency: 'GBP' })).toBe(true)
  })

  it('rejects floats, bad currencies, and non-objects', () => {
    const p = money({})
    expect(p.validate({ amount: 12.34, currency: 'USD' })).toBe(false) // float minor units
    expect(p.validate({ amount: 100, currency: 'usd' })).toBe(false) // lowercase
    expect(p.validate({ amount: 100, currency: 'US' })).toBe(false) // too short
    expect(p.validate({ amount: 100, currency: 'DOLLAR' })).toBe(false)
    expect(p.validate({ amount: 100 })).toBe(false) // missing currency
    expect(p.validate(1234)).toBe(false)
    expect(p.validate('1234')).toBe(false)
  })

  it('treats null/undefined as valid only when not required', () => {
    expect(money({}).validate(null)).toBe(true)
    expect(money({}).validate(undefined)).toBe(true)
    expect(money({ required: true }).validate(null)).toBe(false)
    expect(money({ required: true }).validate(undefined)).toBe(false)
  })

  it('coerces: rounds amount and upper-cases the currency', () => {
    const p = money({})
    expect(p.coerce({ amount: 1234.6, currency: 'usd' })).toEqual({ amount: 1235, currency: 'USD' })
    expect(p.coerce({ amount: 100, currency: 'Eur' })).toEqual({ amount: 100, currency: 'EUR' })
    expect(p.coerce(null)).toBeNull()
    expect(p.coerce({ amount: 'x', currency: 'USD' })).toBeNull()
    expect(p.coerce({ amount: 100, currency: 'XX' })).toBeNull()
  })

  it('enforces a single-currency constraint when configured', () => {
    const p = money({ currency: 'usd' })
    expect(p.definition.config).toMatchObject({ format: 'money', currency: 'USD' })
    expect(p.validate({ amount: 100, currency: 'USD' })).toBe(true)
    expect(p.validate({ amount: 100, currency: 'EUR' })).toBe(false)
    expect(p.coerce({ amount: 100, currency: 'EUR' })).toBeNull()
  })

  it('isMoneyValue narrows structurally', () => {
    expect(isMoneyValue({ amount: 1, currency: 'USD' })).toBe(true)
    expect(isMoneyValue({ amount: 1.5, currency: 'USD' })).toBe(false)
    expect(isMoneyValue(null)).toBe(false)
    expect(isMoneyValue({})).toBe(false)
  })
})
