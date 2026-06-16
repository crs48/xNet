/**
 * Money property helper (exploration 0187).
 *
 * A fixed-precision monetary amount stored as **integer minor units** plus an
 * ISO-4217 currency code — never a float. `$12.34` is `{ amount: 1234,
 * currency: 'USD' }`; `¥500` is `{ amount: 500, currency: 'JPY' }` (JPY has a
 * 0-digit exponent). Integer minor units are exact for fixed-precision currency,
 * so a ledger built on them balances to the cent across any number of rows; IEEE
 * 754 floats accumulate error and must never own authoritative balances.
 *
 * Storage rides the existing `json` property path (`definition.type: 'json'`):
 * a `MoneyValue` is a plain JSON object, so it serializes, syncs (LWW), and
 * queries with zero changes to the `PropertyType` union or the many switch
 * statements over it. The TypeScript marker (`_type`) is still `MoneyValue`, so
 * schema inference and the typed `create()`/`update()` API are fully preserved.
 * The `config.format: 'money'` marker lets UI field renderers opt into a money
 * editor without a new core type.
 */

import type { PropertyBuilder } from '../types'

/** A fixed-precision monetary amount: integer MINOR units + ISO-4217 code. */
export interface MoneyValue {
  /** Signed minor units. USD $12.34 → 1234; JPY ¥500 → 500 (0-exponent). */
  amount: number
  /** ISO-4217 alphabetic code, e.g. "USD", "EUR", "JPY". */
  currency: string
}

export interface MoneyOptions {
  required?: boolean
  /** Constrain this property to a single currency (rejects any other). */
  currency?: string
}

/** Narrow an unknown value to a structurally-valid MoneyValue. */
export function isMoneyValue(value: unknown): value is MoneyValue {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.amount === 'number' &&
    Number.isInteger(v.amount) &&
    typeof v.currency === 'string' &&
    /^[A-Z]{3}$/.test(v.currency)
  )
}

/**
 * Define a money property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     amount: money({ required: true }),       // any currency
 *     fee: money({ currency: 'USD' })          // USD-only
 *   }
 * })
 * ```
 */
export function money(options: MoneyOptions = {}): PropertyBuilder<MoneyValue> {
  const currencyConstraint = options.currency?.toUpperCase()

  return {
    definition: {
      type: 'json',
      required: options.required ?? false,
      config: {
        format: 'money',
        ...(currencyConstraint !== undefined && { currency: currencyConstraint })
      }
    },

    validate(value: unknown): value is MoneyValue {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (!isMoneyValue(value)) return false
      if (currencyConstraint && value.currency !== currencyConstraint) return false
      return true
    },

    coerce(value: unknown): MoneyValue | null {
      if (value === null || value === undefined) return null
      if (typeof value !== 'object') return null
      const v = value as Partial<MoneyValue>
      if (typeof v.amount !== 'number' || isNaN(v.amount)) return null
      if (typeof v.currency !== 'string' || !/^[A-Za-z]{3}$/.test(v.currency)) return null
      const currency = v.currency.toUpperCase()
      if (currencyConstraint && currency !== currencyConstraint) return null
      return { amount: Math.round(v.amount), currency }
    },

    _type: { amount: 0, currency: 'USD' } as MoneyValue
  }
}
