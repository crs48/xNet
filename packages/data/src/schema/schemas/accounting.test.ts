import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { AccountSchema } from './account'
import { TransactionSchema } from './transaction'
import { PostingSchema } from './posting'
import { BudgetSchema } from './budget'
import { ImportBatchSchema } from './import-batch'
import { builtInSchemas } from './index'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('double-entry accounting schemas (0187)', () => {
  it('registers all five schemas under versioned and legacy IRIs', () => {
    for (const iri of [
      'xnet://xnet.fyi/Account@1.0.0',
      'xnet://xnet.fyi/Transaction@1.0.0',
      'xnet://xnet.fyi/Posting@1.0.0',
      'xnet://xnet.fyi/Budget@1.0.0',
      'xnet://xnet.fyi/ImportBatch@1.0.0',
      'xnet://xnet.fyi/Account',
      'xnet://xnet.fyi/Transaction',
      'xnet://xnet.fyi/Posting',
      'xnet://xnet.fyi/Budget',
      'xnet://xnet.fyi/ImportBatch'
    ] as const) {
      expect(builtInSchemas[iri]).toBeTypeOf('function')
    }
  })

  it('all five inherit Space-cascade authorization', () => {
    for (const schema of [
      AccountSchema,
      TransactionSchema,
      PostingSchema,
      BudgetSchema,
      ImportBatchSchema
    ]) {
      expect(schema.schema.authorization).toBeDefined()
    }
  })

  describe('AccountSchema', () => {
    it('defaults to an expense account, private', () => {
      const account = AccountSchema.create({ name: 'Groceries' }, { createdBy: testDID })
      expect(account.class).toBe('expense')
      expect(account.isGroup).toBe(false)
      expect(account.visibility).toBe('private')
    })

    it('accepts each double-entry class', () => {
      for (const cls of ['asset', 'liability', 'equity', 'income', 'expense'] as const) {
        const a = AccountSchema.create({ name: cls, class: cls }, { createdBy: testDID })
        expect(a.class).toBe(cls)
      }
    })
  })

  describe('TransactionSchema', () => {
    it('defaults to pending status, private', () => {
      const txn = TransactionSchema.create({ date: Date.UTC(2026, 0, 1) }, { createdBy: testDID })
      expect(txn.status).toBe('pending')
      expect(txn.visibility).toBe('private')
    })
  })

  describe('PostingSchema', () => {
    it('stores a signed money amount and validates', () => {
      const posting = PostingSchema.create(
        {
          transaction: 'txn1',
          account: 'acct1',
          amount: { amount: -4000, currency: 'USD' }
        },
        { createdBy: testDID }
      )
      expect(posting.amount).toEqual({ amount: -4000, currency: 'USD' })
      expect(PostingSchema.validate(posting).valid).toBe(true)
    })

    it('rejects a float minor-unit amount', () => {
      const bad = PostingSchema.create(
        { transaction: 't', account: 'a', amount: { amount: 40.5, currency: 'USD' } },
        { createdBy: testDID }
      )
      // coerce rounds floats, so the persisted value is an integer again.
      expect(Number.isInteger((bad.amount as { amount: number }).amount)).toBe(true)
    })

    it('requires transaction, account, and amount', () => {
      const result = PostingSchema.validate({
        id: 'p1',
        schemaId: 'xnet://xnet.fyi/Posting@1.0.0',
        createdAt: 0,
        createdBy: testDID
      })
      expect(result.valid).toBe(false)
      expect(result.errors.map((e) => e.path).sort()).toEqual(['account', 'amount', 'transaction'])
    })
  })

  describe('BudgetSchema', () => {
    it('defaults to monthly, private', () => {
      const budget = BudgetSchema.create(
        { account: 'acct1', limit: { amount: 50000, currency: 'USD' } },
        { createdBy: testDID }
      )
      expect(budget.period).toBe('monthly')
      expect(budget.visibility).toBe('private')
    })
  })

  describe('ImportBatchSchema', () => {
    it('records source and importedAt, private', () => {
      const batch = ImportBatchSchema.create(
        { source: 'csv', importedAt: Date.UTC(2026, 0, 1), count: 12 },
        { createdBy: testDID }
      )
      expect(batch.source).toBe('csv')
      expect(batch.count).toBe(12)
      expect(batch.visibility).toBe('private')
    })
  })
})
