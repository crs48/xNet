/**
 * @xnetjs/billing — tiny shared coercion helpers for reading untyped provider
 * objects (webhook payloads are `unknown`). Extracted so the Stripe and BTCPay
 * adapters don't duplicate them.
 */

export type Obj = Record<string, unknown>

export const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}
