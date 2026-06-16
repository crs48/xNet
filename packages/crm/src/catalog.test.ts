import { describe, expect, it } from 'vitest'
import { dealLineItemTotal, lineItemTotal } from './catalog'

describe('catalog math', () => {
  it('totals a line item with quantity, override price, and discount', () => {
    expect(lineItemTotal({ quantity: 3, unitPrice: 100 })).toBe(300)
    expect(lineItemTotal({ quantity: 2, unitPrice: 100, discount: 0.25 })).toBe(150)
  })

  it('falls back to the product price when no override is set', () => {
    const priceOf = (id: string) => (id === 'p1' ? 50 : null)
    expect(lineItemTotal({ product: 'p1', quantity: 2 }, priceOf)).toBe(100)
    expect(lineItemTotal({ product: 'missing', quantity: 2 }, priceOf)).toBe(0)
  })

  it('defaults quantity to 1 and clamps the discount to [0,1]', () => {
    expect(lineItemTotal({ unitPrice: 100 })).toBe(100)
    expect(lineItemTotal({ unitPrice: 100, discount: 2 })).toBe(0)
    expect(lineItemTotal({ unitPrice: 100, discount: -1 })).toBe(100)
  })

  it('sums a deal of line items', () => {
    const total = dealLineItemTotal([
      { quantity: 1, unitPrice: 100 },
      { quantity: 2, unitPrice: 50, discount: 0.5 }
    ])
    expect(total).toBe(150)
  })
})
