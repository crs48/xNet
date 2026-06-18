/**
 * xNet Cloud — public "run the company in public" metrics rollup.
 *
 * Turns the control plane's private weekly state (tenant counts, MRR from billing,
 * measured infra COGS) plus the hand-maintained company opex into the
 * privacy-safe, aggregate-only snapshot the marketing `/open` page renders
 * (exploration 0200, slice C). The output is published by committing it to
 * `site/src/data/metrics.json` — the git history is the transparency log.
 *
 * Privacy is the hard constraint: this only ever emits company aggregates, never
 * per-customer revenue, and it SUPPRESSES any week whose paying-customer count is
 * below `cohortFloor` (a small base makes even aggregates re-identifiable). Pure +
 * I/O-free so the suppression rule is exhaustively unit-testable.
 */

/** One week of raw, private inputs (never published as-is). */
export interface WeeklyInput {
  /** ISO date of the week start (Monday), e.g. `2026-06-15`. */
  week: string
  /** Total paying tenants at week end. */
  customers: number
  newCustomers: number
  churnedCustomers: number
  /** Aggregate monthly recurring revenue (USD) — never per-customer. */
  mrrUsd: number
  /** Measured infrastructure COGS for the week (USD) — from the cost reconciliation. */
  infraUsd: number
}

/** Company operating costs for a week (hand-maintained; payroll + SaaS + one-offs). */
export interface WeeklyOpex {
  week: string
  payrollUsd: number
  saasUsd: number
  otherUsd: number
}

export interface CompanyMetricsWeek {
  week: string
  customers: number
  newCustomers: number
  churnedCustomers: number
  mrrUsd: number
  costs: { infraUsd: number; payrollUsd: number; saasUsd: number; otherUsd: number }
}

export interface CompanyMetrics {
  /** ISO date this snapshot was produced. */
  updated: string
  /** Weeks with fewer paying customers than this are suppressed. */
  cohortFloor: number
  weeks: CompanyMetricsWeek[]
  breakEven: { reached: boolean; targetWeek?: string }
}

export interface BuildMetricsInput {
  updated: string
  cohortFloor: number
  weekly: WeeklyInput[]
  opex: WeeklyOpex[]
}

const round = (n: number): number => Math.round(n * 100) / 100

/** Weekly revenue ≈ MRR / 4.345 (avg weeks/month). Used only for break-even. */
const weeklyRevenue = (mrrUsd: number): number => mrrUsd / 4.345

/**
 * Compute cumulative (revenue − total cost) week over week and the first week it
 * turns non-negative. Revenue is approximated from MRR; costs are the full stack
 * (infra + payroll + SaaS + other).
 */
export function computeBreakEven(weeks: CompanyMetricsWeek[]): {
  reached: boolean
  targetWeek?: string
} {
  let cumulative = 0
  for (const w of weeks) {
    const cost = w.costs.infraUsd + w.costs.payrollUsd + w.costs.saasUsd + w.costs.otherUsd
    cumulative += weeklyRevenue(w.mrrUsd) - cost
    if (cumulative >= 0) return { reached: true, targetWeek: w.week }
  }
  return { reached: false }
}

/**
 * Build the public snapshot: join weekly inputs with opex, suppress sub-floor
 * weeks, round money, and compute break-even. Weeks are emitted oldest → newest.
 */
export function buildCompanyMetrics(input: BuildMetricsInput): CompanyMetrics {
  const opexByWeek = new Map(input.opex.map((o) => [o.week, o]))

  const weeks: CompanyMetricsWeek[] = input.weekly
    .filter((w) => w.customers >= input.cohortFloor) // k-anonymity: suppress thin weeks
    .slice()
    .sort((a, b) => (a.week < b.week ? -1 : 1))
    .map((w) => {
      const o = opexByWeek.get(w.week)
      return {
        week: w.week,
        customers: w.customers,
        newCustomers: w.newCustomers,
        churnedCustomers: w.churnedCustomers,
        mrrUsd: round(w.mrrUsd),
        costs: {
          infraUsd: round(w.infraUsd),
          payrollUsd: round(o?.payrollUsd ?? 0),
          saasUsd: round(o?.saasUsd ?? 0),
          otherUsd: round(o?.otherUsd ?? 0)
        }
      }
    })

  return {
    updated: input.updated,
    cohortFloor: input.cohortFloor,
    weeks,
    breakEven: computeBreakEven(weeks)
  }
}
