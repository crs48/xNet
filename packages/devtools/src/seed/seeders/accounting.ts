/**
 * Accounting seeder — a small double-entry ledger:
 * a chart-of-accounts tree (Account.parent), Transactions each with BALANCED
 * Postings (sum to zero per currency; +debit / −credit), Budgets, and an
 * ImportBatch. Some transactions link to CRM deals (quote-to-cash).
 * Scoped to the Personal space, filed under personal/finance.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  AccountSchema,
  BudgetSchema,
  ImportBatchSchema,
  PostingSchema,
  TransactionSchema
} from '@xnetjs/data'
import { int, pick, seedId } from '../seed-ids'
import { crmDealId } from './crm'

const DAY = 86_400_000
const BASE_TS = 1_750_000_000_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const accountId = (slug: string) => seedId('account', slug)
const usd = (cents: number) => ({ amount: cents, currency: 'USD' })

const ACCOUNTS: ReadonlyArray<{
  slug: string
  name: string
  class: string
  parent?: string
  group?: boolean
}> = [
  { slug: 'assets', name: 'Assets', class: 'asset', group: true },
  { slug: 'checking', name: 'Checking', class: 'asset', parent: 'assets' },
  { slug: 'savings', name: 'Savings', class: 'asset', parent: 'assets' },
  { slug: 'income', name: 'Income', class: 'income', group: true },
  { slug: 'sales', name: 'Sales Revenue', class: 'income', parent: 'income' },
  { slug: 'expenses', name: 'Expenses', class: 'expense', group: true },
  { slug: 'rent', name: 'Rent', class: 'expense', parent: 'expenses' },
  { slug: 'software', name: 'Software', class: 'expense', parent: 'expenses' },
  { slug: 'travel', name: 'Travel', class: 'expense', parent: 'expenses' },
  { slug: 'liabilities', name: 'Liabilities', class: 'liability', group: true },
  { slug: 'creditcard', name: 'Credit Card', class: 'liability', parent: 'liabilities' }
]

const EXPENSE_ACCOUNTS = ['rent', 'software', 'travel'] as const

/** A transaction + its balanced postings (throws if legs don't net to zero). */
function balancedTxn(
  slug: string,
  date: string,
  payee: string,
  legs: ReadonlyArray<{ account: string; cents: number }>,
  extra: Record<string, unknown>,
  space: string
): DeterministicNodeImportDraft[] {
  const sum = legs.reduce((s, l) => s + l.cents, 0)
  if (sum !== 0) throw new Error(`unbalanced seed transaction ${slug}: ${sum}`)
  const txId = seedId('txn', slug)
  return [
    {
      id: txId,
      schemaId: TransactionSchema._schemaId,
      properties: { date, payee, status: 'cleared', space, ...extra }
    },
    ...legs.map((leg, i) => ({
      id: seedId('posting', slug, i),
      schemaId: PostingSchema._schemaId,
      properties: {
        transaction: txId,
        account: accountId(leg.account),
        amount: usd(leg.cents),
        space
      }
    }))
  ]
}

export const accountingSeeder: SeederModule = {
  domain: 'accounting',
  label: 'Ledger (accounts, postings)',
  schemaIds: [
    AccountSchema._schemaId,
    TransactionSchema._schemaId,
    PostingSchema._schemaId,
    BudgetSchema._schemaId,
    ImportBatchSchema._schemaId
  ],
  seed: ({ fixtures, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const space = fixtures.spaces.personal
    const folder = fixtures.folder('personal/finance')

    // ─── Chart of accounts (tree via parent) ─────────────────────────────
    ACCOUNTS.forEach((acct, i) => {
      drafts.push({
        id: accountId(acct.slug),
        schemaId: AccountSchema._schemaId,
        properties: {
          name: acct.name,
          class: acct.class,
          isGroup: acct.group ?? false,
          parent: acct.parent ? accountId(acct.parent) : undefined,
          sortKey: `a${i}`,
          currency: 'USD',
          folder,
          space
        }
      })
    })

    // ─── Import batch ────────────────────────────────────────────────────
    drafts.push({
      id: seedId('importbatch', 'jun'),
      schemaId: ImportBatchSchema._schemaId,
      properties: {
        source: 'csv',
        filename: 'statement-june.csv',
        importedAt: BASE_TS,
        account: accountId('checking'),
        count: scale.transactions,
        space
      }
    })

    // ─── Transactions with balanced postings ─────────────────────────────
    for (let t = 0; t < scale.transactions; t++) {
      const amount = int(rng, 5, 200) * 100
      const date = iso(BASE_TS - t * DAY)
      if (t % 3 === 0) {
        // Income: debit checking, credit sales. Linked to a CRM deal.
        drafts.push(
          ...balancedTxn(
            String(t),
            date,
            'Customer payment',
            [
              { account: 'checking', cents: amount },
              { account: 'sales', cents: -amount }
            ],
            {
              deal: crmDealId(t % Math.max(1, scale.deals)),
              importBatch: seedId('importbatch', 'jun')
            },
            space
          )
        )
      } else {
        // Expense: debit an expense account, credit checking.
        const exp = pick(rng, EXPENSE_ACCOUNTS)
        drafts.push(
          ...balancedTxn(
            String(t),
            date,
            pick(rng, ['Acme Rent Co', 'GitHub', 'Figma', 'United Airlines', 'AWS']),
            [
              { account: exp, cents: amount },
              { account: 'checking', cents: -amount }
            ],
            { importBatch: seedId('importbatch', 'jun') },
            space
          )
        )
      }
    }

    // ─── Budgets ─────────────────────────────────────────────────────────
    for (const acct of ['software', 'rent'] as const) {
      drafts.push({
        id: seedId('budget', acct),
        schemaId: BudgetSchema._schemaId,
        properties: {
          name: `${acct} budget`,
          account: accountId(acct),
          limit: usd(int(rng, 5, 30) * 1000),
          period: 'monthly',
          folder,
          space
        }
      })
    }

    return { drafts }
  }
}
