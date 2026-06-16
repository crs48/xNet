/**
 * Catalog math — line-item totals for a deal. The ERP seed: once Quote/Order/
 * Invoice land (deferred), they reuse the same line-item shape.
 */

export interface LineItemLike {
  product?: string | null
  quantity?: number | null
  /** Overrides the product's unit price when set. */
  unitPrice?: number | null
  /** Discount fraction, 0–1. */
  discount?: number | null
}

/** Look up a product's unit price by product id (for items without an override). */
export type PriceLookup = (productId: string) => number | null | undefined

/** Total for a single line item: quantity × effective unit price × (1 − discount). */
export function lineItemTotal(item: LineItemLike, priceOf?: PriceLookup): number {
  const quantity = item.quantity ?? 1
  const fallback = item.product != null && priceOf ? (priceOf(item.product) ?? 0) : 0
  const unitPrice = item.unitPrice ?? fallback
  const discount = Math.min(Math.max(item.discount ?? 0, 0), 1)
  return quantity * unitPrice * (1 - discount)
}

/** Sum of all line-item totals on a deal. */
export function dealLineItemTotal(items: LineItemLike[], priceOf?: PriceLookup): number {
  return items.reduce((sum, item) => sum + lineItemTotal(item, priceOf), 0)
}
