/**
 * AccountSchema — a node in the chart of accounts (exploration 0187).
 *
 * One of the five double-entry classes (asset / liability / equity / income /
 * expense). Accounts form a tree via `parent` for roll-up. A balance is never
 * stored here — it is always derived from the Postings that reference the
 * account (see @xnetjs/ledger). Financial data is private by default and
 * inherits shared access from its home Space.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, select, checkbox, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const ACCOUNT_SCHEMA_IRI = 'xnet://xnet.fyi/Account@1.0.0'

export const AccountSchema = defineSchema({
  name: 'Account',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display name, e.g. "Checking" or "Groceries". */
    name: text({ required: true, maxLength: 200 }),

    /** The double-entry class — drives debit/credit sign and reporting bucket. */
    class: select({
      options: [
        { id: 'asset', name: 'Asset', color: 'green' },
        { id: 'liability', name: 'Liability', color: 'red' },
        { id: 'equity', name: 'Equity', color: 'purple' },
        { id: 'income', name: 'Income', color: 'blue' },
        { id: 'expense', name: 'Expense', color: 'orange' }
      ] as const,
      default: 'expense'
    }),

    /** Hierarchical code for ordering / roll-up, e.g. "1000", "1010". */
    code: text({ maxLength: 40 }),

    /** ISO-4217 reporting currency for this account (app default: USD). */
    currency: text({ maxLength: 3 }),

    /** Roll-up group header (no postings of its own) vs a postable leaf. */
    isGroup: checkbox({ default: false }),

    /** Chart-of-accounts tree parent. */
    parent: relation({ target: ACCOUNT_SCHEMA_IRI }),

    /** Order among siblings — fractional index (exploration 0169 pattern). */
    sortKey: text({ maxLength: 500 }),

    /** Canonical SECURITY home; empty = personal/private book (0179/0181). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Per-node visibility. Defaults to `private` — financial data is the most
     * sensitive in the app and must never leak to public surfaces (0187).
     */
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
  // Inherits access from its home Space (exploration 0181).
  authorization: spaceCascadeAuthorization()
})

/** An Account node type (inferred from schema). */
export type Account = InferNode<(typeof AccountSchema)['_properties']>

export type AccountClassId = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
