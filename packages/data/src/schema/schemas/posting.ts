/**
 * PostingSchema — one debit/credit leg of a Transaction (exploration 0187).
 *
 * `amount` is a MoneyValue in signed integer minor units where **positive =
 * debit, negative = credit** (see @xnetjs/ledger). The legs of a Transaction
 * must sum to zero per currency. Postings are append-oriented: corrections are
 * modeled as reversing entries rather than mutation (especially for business
 * books), preserving auditability.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, money, relation, select } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const POSTING_SCHEMA_IRI = 'xnet://xnet.fyi/Posting@1.0.0'

export const PostingSchema = defineSchema({
  name: 'Posting',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The owning journal entry. */
    transaction: relation({ target: 'xnet://xnet.fyi/Transaction@1.0.0' as const, required: true }),

    /** The account this leg debits/credits. */
    account: relation({ target: 'xnet://xnet.fyi/Account@1.0.0' as const, required: true }),

    /** Signed minor units + currency (debit positive / credit negative). */
    amount: money({ required: true }),

    /** Optional per-leg note (e.g. for split transactions). */
    memo: text({ maxLength: 500 }),

    /** Mirrors the transaction's Space so access cascades identically. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; defaults to `private` (financial data, 0187). */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'private'
    })
  },
  authorization: spaceCascadeAuthorization()
})

/** A Posting node type (inferred from schema). */
export type Posting = InferNode<(typeof PostingSchema)['_properties']>
