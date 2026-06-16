/**
 * Deal line items (exploration 0190) — the quote-to-cash seed. The LineItem
 * schema + `@xnetjs/crm` catalog math (lineItemTotal / dealLineItemTotal) were
 * built with no UI. This renders a deal's line items (product, qty, unit price
 * override, discount) with a live total, in the Deal inspector's panel slot.
 */
import { dealLineItemTotal, lineItemTotal, type LineItemLike } from '@xnetjs/crm'
import { LineItemSchema, ProductSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { Trash2 } from 'lucide-react'
import { useMemo, type JSX } from 'react'
import { money, num, str } from './crm-helpers'

interface LineRow {
  id: string
  deal?: unknown
  product?: unknown
  quantity?: unknown
  unitPrice?: unknown
  discount?: unknown
}
interface ProductRow {
  id: string
  name?: unknown
  unitPrice?: unknown
  currency?: unknown
}

export function DealLineItems({ dealId }: { dealId: string }): JSX.Element {
  const { data: lineData } = useQuery(LineItemSchema, {})
  const { data: productData } = useQuery(ProductSchema, { orderBy: { createdAt: 'desc' } })
  const { create, update, remove } = useMutate()

  const products = useMemo(() => (productData ?? []) as ProductRow[], [productData])
  const priceOf = useMemo(() => {
    const m = new Map(products.map((p) => [p.id, num(p.unitPrice) ?? 0]))
    return (id: string): number => m.get(id) ?? 0
  }, [products])
  const currency = str(products.find((p) => p.currency)?.currency) || 'USD'

  const lines = ((lineData ?? []) as LineRow[]).filter((l) => str(l.deal) === dealId)
  const asLike = (l: LineRow): LineItemLike => ({
    product: str(l.product) || null,
    quantity: num(l.quantity) ?? 1,
    unitPrice: num(l.unitPrice) ?? null,
    discount: num(l.discount) ?? null
  })
  const total = dealLineItemTotal(lines.map(asLike), priceOf)

  return (
    <div className="flex flex-col gap-2 text-xs">
      {lines.length === 0 ? (
        <p className="text-ink-3">No line items yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-ink-3">
              <th className="font-normal">Product</th>
              <th className="w-12 text-right font-normal">Qty</th>
              <th className="w-20 text-right font-normal">Price</th>
              <th className="w-14 text-right font-normal">Disc</th>
              <th className="w-20 text-right font-normal">Total</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-hairline">
                <td className="py-1">
                  <select
                    aria-label="Product"
                    value={str(l.product)}
                    onChange={(e) =>
                      void update(LineItemSchema, l.id, { product: e.target.value || undefined })
                    }
                    className="w-full rounded-sm border border-hairline bg-surface-1 px-1 py-0.5 text-[11px] text-ink-2"
                  >
                    <option value="">—</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {str(p.name) || 'Untitled'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 text-right">
                  <input
                    type="number"
                    aria-label="Quantity"
                    defaultValue={num(l.quantity) ?? 1}
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      void update(LineItemSchema, l.id, { quantity: Number.isFinite(n) ? n : 1 })
                    }}
                    className="w-10 border-none bg-transparent text-right tabular-nums text-ink-1 outline-none"
                  />
                </td>
                <td className="py-1 text-right">
                  <input
                    type="number"
                    aria-label="Unit price override"
                    defaultValue={num(l.unitPrice) ?? ''}
                    placeholder={String(priceOf(str(l.product)))}
                    onBlur={(e) => {
                      const v = e.target.value
                      void update(LineItemSchema, l.id, {
                        unitPrice: v === '' ? undefined : Math.max(0, Number(v))
                      })
                    }}
                    className="w-16 border-none bg-transparent text-right tabular-nums text-ink-2 outline-none"
                  />
                </td>
                <td className="py-1 text-right">
                  <input
                    type="number"
                    aria-label="Discount fraction"
                    step="0.05"
                    min="0"
                    max="1"
                    defaultValue={num(l.discount) ?? ''}
                    placeholder="0"
                    onBlur={(e) => {
                      const v = e.target.value
                      void update(LineItemSchema, l.id, {
                        discount: v === '' ? undefined : Math.min(1, Math.max(0, Number(v)))
                      })
                    }}
                    className="w-10 border-none bg-transparent text-right tabular-nums text-ink-2 outline-none"
                  />
                </td>
                <td className="py-1 text-right tabular-nums text-ink-1">
                  {money(lineItemTotal(asLike(l), priceOf), currency)}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    aria-label="Remove line item"
                    onClick={() => void remove(l.id)}
                    className="text-ink-3 hover:text-red-500"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between border-t border-hairline pt-1.5">
        <button
          type="button"
          onClick={() => void create(LineItemSchema, { deal: dealId, quantity: 1 })}
          className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-1 hover:bg-accent"
        >
          + Line item
        </button>
        <span className="text-[11px] text-ink-3">
          Total <span className="font-medium text-ink-1">{money(total, currency)}</span>
        </span>
      </div>
    </div>
  )
}
