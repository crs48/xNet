/**
 * Product catalog (exploration 0190) — the Product schema (the ERP seed) had no
 * UI. A simple master list: name / SKU / kind / unit price / active, editable
 * inline. Deals reference these via line items (see DealLineItems).
 */
import { ProductSchema, PRODUCT_KINDS, type ProductKind } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { Plus } from 'lucide-react'
import { type JSX } from 'react'
import { num, str } from './crm-helpers'

interface ProductRow {
  id: string
  name?: unknown
  sku?: unknown
  kind?: unknown
  unitPrice?: unknown
  active?: unknown
}

export function ProductsPanel(): JSX.Element {
  const { data, loading } = useQuery(ProductSchema, { orderBy: { createdAt: 'desc' } })
  const { create, update } = useMutate()
  const products = (data ?? []) as ProductRow[]

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-1">Products</h2>
        <button
          type="button"
          onClick={() => void create(ProductSchema, { name: 'New product', kind: 'service' })}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-1 hover:bg-accent"
        >
          <Plus size={13} strokeWidth={1.5} /> New product
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-xs text-ink-3">No products yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 font-normal">SKU</th>
              <th className="py-1 font-normal">Kind</th>
              <th className="py-1 text-right font-normal">Unit price</th>
              <th className="py-1 text-center font-normal">Active</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-hairline">
                <td className="py-1">
                  <input
                    defaultValue={str(p.name)}
                    onBlur={(e) => void update(ProductSchema, p.id, { name: e.target.value })}
                    className="w-full border-none bg-transparent text-ink-1 outline-none"
                  />
                </td>
                <td className="py-1">
                  <input
                    defaultValue={str(p.sku)}
                    placeholder="—"
                    onBlur={(e) =>
                      void update(ProductSchema, p.id, { sku: e.target.value || undefined })
                    }
                    className="w-24 border-none bg-transparent text-ink-2 outline-none"
                  />
                </td>
                <td className="py-1">
                  <select
                    value={str(p.kind) || 'service'}
                    onChange={(e) =>
                      void update(ProductSchema, p.id, { kind: e.target.value as ProductKind })
                    }
                    className="rounded-sm border border-hairline bg-surface-1 px-1 py-0.5 text-[11px] text-ink-2"
                  >
                    {PRODUCT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 text-right">
                  <input
                    type="number"
                    defaultValue={num(p.unitPrice) ?? ''}
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      void update(ProductSchema, p.id, {
                        unitPrice: Number.isFinite(n) ? Math.max(0, n) : 0
                      })
                    }}
                    className="w-20 border-none bg-transparent text-right tabular-nums text-ink-1 outline-none"
                  />
                </td>
                <td className="py-1 text-center">
                  <input
                    type="checkbox"
                    checked={p.active !== false}
                    onChange={(e) => void update(ProductSchema, p.id, { active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
