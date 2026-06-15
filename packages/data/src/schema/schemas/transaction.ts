/**
 * TransactionSchema — a journal entry (exploration 0187).
 *
 * A Transaction is the *event*; its money lives in the Posting nodes that
 * reference it (≥ 2 legs that sum to zero per currency). Keeping postings as
 * separate nodes lets a transaction split across many accounts and lets each
 * leg carry its own amount/currency. The balancing invariant is enforced in the
 * app/ledger layer, and a Transaction + its Postings are written in one atomic
 * batch so the book is never persisted unbalanced.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, date, select, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const TRANSACTION_SCHEMA_IRI = 'xnet://xnet.fyi/Transaction@1.0.0'

export const TransactionSchema = defineSchema({
  name: 'Transaction',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** When the transaction posted (Unix ms). */
    date: date({ required: true }),

    /** Who was paid / who paid (free text). */
    payee: text({ maxLength: 200 }),

    /** Note / description. */
    memo: text({ maxLength: 2000 }),

    /**
     * Counterparty in the person/contact graph (AR/AP). Untyped so it can point
     * at a Profile, a ConnectableProfile (CRM), or any contact node.
     */
    counterparty: relation({}),

    /** Reconciliation state. */
    status: select({
      options: [
        { id: 'pending', name: 'Pending', color: 'gray' },
        { id: 'cleared', name: 'Cleared', color: 'blue' },
        { id: 'reconciled', name: 'Reconciled', color: 'green' }
      ] as const,
      default: 'pending'
    }),

    /** The import batch that produced this transaction, if any. */
    importBatch: relation({ target: 'xnet://xnet.fyi/ImportBatch@1.0.0' as const }),

    /** Stable provider/file id for de-duplication on re-import. */
    externalId: text({ maxLength: 200 }),

    /** Canonical SECURITY home; empty = personal/private book (0179/0181). */
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

/** A Transaction node type (inferred from schema). */
export type Transaction = InferNode<(typeof TransactionSchema)['_properties']>

export type TransactionStatus = 'pending' | 'cleared' | 'reconciled'
