/**
 * xNet Cloud — company operating costs, in the open.
 *
 * Hand-maintained line items behind the cost side of the `/open` dashboard
 * (exploration 0200, slice C). Kept as plain data — like roadmap.ts / pricing.ts —
 * so every change to what the company spends is a reviewable, dated git commit.
 * Infrastructure COGS is measured automatically and lives in the weekly series
 * (metrics.json); the recurring company opex below (payroll, SaaS, overhead) is
 * the part a human keeps honest.
 *
 * These are illustrative figures for an early, lean operation — replace with the
 * real P&L when we go fully public.
 */

type OpexCategory = 'Payroll' | 'Software' | 'Infrastructure' | 'Overhead'

interface OpexLine {
  category: OpexCategory
  name: string
  /** Recurring monthly cost in USD. */
  monthlyUsd: number
  note?: string
}

/** Recurring monthly operating costs. Infra here is the fixed floor; usage-based infra rides the weekly COGS. */
const OPEX: OpexLine[] = [
  {
    category: 'Payroll',
    name: 'Founder (below-market draw)',
    monthlyUsd: 4000,
    note: 'Intentionally lean while pre-revenue'
  },
  { category: 'Payroll', name: 'Part-time contractor (design/support)', monthlyUsd: 1200 },
  {
    category: 'Software',
    name: 'WorkOS (auth, free tier → SSO add-ons)',
    monthlyUsd: 0,
    note: 'Free under 1M MAU; SSO billed per enterprise connection'
  },
  {
    category: 'Software',
    name: 'Stripe (processing fees ride revenue)',
    monthlyUsd: 0,
    note: '2.9% + 30¢ per charge — counted in weekly COGS'
  },
  { category: 'Software', name: 'Email, monitoring, misc SaaS', monthlyUsd: 120 },
  {
    category: 'Infrastructure',
    name: 'Always-on control plane + LiteLLM proxy',
    monthlyUsd: 40,
    note: 'Per-tenant hub compute/storage rides the weekly COGS'
  },
  { category: 'Infrastructure', name: 'Domains, R2 baseline, backups', monthlyUsd: 25 },
  { category: 'Overhead', name: 'Accounting, legal, banking', monthlyUsd: 200 }
]

export const monthlyOpexTotal = OPEX.reduce((sum, l) => sum + l.monthlyUsd, 0)
