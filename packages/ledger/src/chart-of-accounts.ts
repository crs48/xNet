/**
 * Default chart of accounts (exploration 0187).
 *
 * A sensible personal-finance starting chart. Specs are id-free — the app
 * materializes them into Account nodes, assigning ids and resolving `parentCode`
 * to a parent node id. `chartCreateOrder()` guarantees parents are created
 * before their children.
 */

import type { AccountClass } from './balance'

export interface ChartAccountSpec {
  /** Hierarchical code (also used to wire parents during seeding). */
  code: string
  name: string
  class: AccountClass
  /** Code of the parent group, if this is a sub-account. */
  parentCode?: string
  /** True for roll-up group headers (no postings of their own). */
  group?: boolean
}

/** The default personal chart: 5 class groups + common leaf accounts. */
export const PERSONAL_CHART: ChartAccountSpec[] = [
  // Assets
  { code: '1000', name: 'Assets', class: 'asset', group: true },
  { code: '1010', name: 'Checking', class: 'asset', parentCode: '1000' },
  { code: '1020', name: 'Savings', class: 'asset', parentCode: '1000' },
  { code: '1030', name: 'Cash', class: 'asset', parentCode: '1000' },
  { code: '1100', name: 'Investments', class: 'asset', parentCode: '1000' },

  // Liabilities
  { code: '2000', name: 'Liabilities', class: 'liability', group: true },
  { code: '2010', name: 'Credit Card', class: 'liability', parentCode: '2000' },
  { code: '2020', name: 'Loans', class: 'liability', parentCode: '2000' },

  // Equity
  { code: '3000', name: 'Equity', class: 'equity', group: true },
  { code: '3010', name: 'Opening Balances', class: 'equity', parentCode: '3000' },

  // Income
  { code: '4000', name: 'Income', class: 'income', group: true },
  { code: '4010', name: 'Salary', class: 'income', parentCode: '4000' },
  { code: '4020', name: 'Interest', class: 'income', parentCode: '4000' },
  { code: '4090', name: 'Other Income', class: 'income', parentCode: '4000' },

  // Expenses
  { code: '5000', name: 'Expenses', class: 'expense', group: true },
  { code: '5010', name: 'Housing', class: 'expense', parentCode: '5000' },
  { code: '5020', name: 'Groceries', class: 'expense', parentCode: '5000' },
  { code: '5030', name: 'Dining', class: 'expense', parentCode: '5000' },
  { code: '5040', name: 'Transport', class: 'expense', parentCode: '5000' },
  { code: '5050', name: 'Utilities', class: 'expense', parentCode: '5000' },
  { code: '5060', name: 'Health', class: 'expense', parentCode: '5000' },
  { code: '5070', name: 'Entertainment', class: 'expense', parentCode: '5000' },
  { code: '5080', name: 'Shopping', class: 'expense', parentCode: '5000' },
  { code: '5090', name: 'Other', class: 'expense', parentCode: '5000' }
]

/**
 * Topologically order a chart so every parent precedes its children. Throws on a
 * missing or cyclic parentCode so seeding never silently drops accounts.
 */
export function chartCreateOrder(specs: readonly ChartAccountSpec[]): ChartAccountSpec[] {
  const byCode = new Map(specs.map((s) => [s.code, s]))
  const ordered: ChartAccountSpec[] = []
  const placed = new Set<string>()
  const visiting = new Set<string>()

  const place = (spec: ChartAccountSpec) => {
    if (placed.has(spec.code)) return
    if (visiting.has(spec.code)) {
      throw new Error(`Cyclic parentCode in chart of accounts at "${spec.code}"`)
    }
    visiting.add(spec.code)
    if (spec.parentCode) {
      const parent = byCode.get(spec.parentCode)
      if (!parent) {
        throw new Error(`Account "${spec.code}" references missing parent "${spec.parentCode}"`)
      }
      place(parent)
    }
    visiting.delete(spec.code)
    placed.add(spec.code)
    ordered.push(spec)
  }

  for (const spec of specs) place(spec)
  return ordered
}
