/**
 * Small shared helpers for the CRM surface (exploration 0188). Node property
 * values arrive loosely typed at the component boundary, so these readers keep
 * the JSX terse and defensive.
 */

export const str = (v: unknown): string => (typeof v === 'string' ? v : '')
export const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

/** Format an epoch-ms amount as a compact currency string. */
export function money(amount: number | undefined, currency = 'USD'): string {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0
    }).format(amount)
  } catch {
    return `$${Math.round(amount).toLocaleString()}`
  }
}

/** A short relative-day label for a UTC-ish epoch ms ("today", "in 3d", "5d ago"). */
export function relDays(days: number | null | undefined): string {
  if (days == null) return ''
  if (days === 0) return 'today'
  if (days > 0) return `in ${days}d`
  return `${-days}d ago`
}
