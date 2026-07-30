/**
 * Fault-injecting SQLiteAdapter wrapper (exploration 0272, Pillar 3).
 *
 * Wraps a real adapter and, when armed, throws a synthetic I/O error on the
 * Nth statement whose SQL matches the target pattern. Transaction-control
 * statements are never sabotaged, so the code under test can always roll
 * back — we are testing the caller's failure handling, not SQLite's.
 */

import type { SQLiteAdapter } from '@xnetjs/sqlite'

export class InjectedSQLiteFault extends Error {
  constructor(sql: string) {
    super(`[0272 fault injection] synthetic I/O failure on: ${sql.slice(0, 60)}…`)
    this.name = 'InjectedSQLiteFault'
  }
}

export interface FaultPlan {
  /** Substring of the SQL to sabotage (e.g. 'INSERT INTO node_properties'). */
  sqlIncludes: string
  /** Fail the Nth matching statement (1-based). */
  failOnMatch: number
}

export interface FaultInjectingAdapter {
  adapter: SQLiteAdapter
  /** Arm the fault. Disarms itself after firing once. */
  arm(plan: FaultPlan): void
  /** How many times the fault has fired. */
  firedCount(): number
}

export function wrapWithFaults(real: SQLiteAdapter): FaultInjectingAdapter {
  let plan: FaultPlan | null = null
  let matches = 0
  let fired = 0

  const maybeFail = (sql: string): void => {
    if (!plan) return
    if (!sql.includes(plan.sqlIncludes)) return
    matches += 1
    if (matches === plan.failOnMatch) {
      plan = null
      fired += 1
      throw new InjectedSQLiteFault(sql)
    }
  }

  const adapter = new Proxy(real, {
    get(target, property, receiver) {
      if (property === 'run' || property === 'query' || property === 'queryOne') {
        return (sql: string, ...rest: unknown[]) => {
          maybeFail(sql)
          return (target as unknown as Record<string, (...a: unknown[]) => unknown>)[
            property as string
          ](sql, ...rest)
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as SQLiteAdapter

  return {
    adapter,
    arm(next: FaultPlan) {
      plan = next
      matches = 0
    },
    firedCount: () => fired
  }
}
