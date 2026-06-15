/**
 * @xnetjs/ledger — pure double-entry accounting logic (exploration 0187).
 *
 * Dependency-free, framework-agnostic functions over plain structures (the same
 * discipline as @xnetjs/experiments). The data model — Account / Transaction /
 * Posting — lives in @xnetjs/data; the UI lives in apps/web. Everything here is
 * integer minor units: balances are exact and derived, never stored.
 */

// Currency arithmetic
export {
  currencyExponent,
  minorUnitsPerMajor,
  parseAmount,
  formatAmount,
  toMajorUnits,
  toMinorUnits
} from './currency'

// Double-entry balancing + account balances
export {
  DEBIT_NORMAL,
  imbalanceByCurrency,
  isBalanced,
  balancingAmount,
  rawBalance,
  naturalBalance,
  accountBalances,
  accountRegister,
  trialBalance,
  type AccountClass,
  type LedgerAccount,
  type LedgerPosting,
  type LedgerTransaction,
  type AccountBalance,
  type RegisterRow,
  type TrialBalanceLine,
  type TrialBalance
} from './balance'

// Reports
export {
  collectPostings,
  netWorth,
  incomeStatement,
  balanceSheet,
  spendingByCategory,
  type CurrencyTotals,
  type NetWorth,
  type IncomeStatement,
  type BalanceSheet,
  type SpendingSlice
} from './report'

// Budgets
export {
  accountSpend,
  budgetStatus,
  budgetStatuses,
  monthRange,
  type LedgerBudget,
  type BudgetStatus
} from './budget'

// Import dedupe + reconciliation
export {
  normalizePayee,
  fingerprint,
  dedupeRows,
  matchCandidates,
  type ImportedRow,
  type ExistingEntry,
  type DedupeResult,
  type MatchCandidate
} from './reconcile'

// File import parsers
export {
  importCsv,
  parseCsv,
  importOfx,
  ofxCurrency,
  importQif,
  parseStatementDate,
  parseOfxDate,
  type CsvMapping,
  type Column,
  type CsvImportResult,
  type OfxImportResult,
  type QifImportResult
} from './import'

// Default chart of accounts
export { PERSONAL_CHART, chartCreateOrder, type ChartAccountSpec } from './chart-of-accounts'
