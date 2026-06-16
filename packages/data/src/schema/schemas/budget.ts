/**
 * BudgetSchema — a spending cap on one account over a period (exploration 0187).
 *
 * A budget targets an (expense) account with a `limit` per recurring period.
 * Status — spent vs remaining — is computed by @xnetjs/ledger from the period's
 * transactions; nothing is stored denormalized.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, money, select, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const BUDGET_SCHEMA_IRI = 'xnet://xnet.fyi/Budget@1.0.0'

export const BudgetSchema = defineSchema({
  name: 'Budget',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Optional label; defaults to the account name in the UI. */
    name: text({ maxLength: 200 }),

    /** The account this budget caps (usually an expense account). */
    account: relation({ target: 'xnet://xnet.fyi/Account@1.0.0' as const, required: true }),

    /** Cap per period, as signed-positive minor units + currency. */
    limit: money({ required: true }),

    /** Recurrence of the cap. */
    period: select({
      options: [
        { id: 'weekly', name: 'Weekly' },
        { id: 'monthly', name: 'Monthly' },
        { id: 'yearly', name: 'Yearly' }
      ] as const,
      default: 'monthly'
    }),

    /** Optional folder home for uniform filing; empty = Unfiled (0190). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

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

/** A Budget node type (inferred from schema). */
export type Budget = InferNode<(typeof BudgetSchema)['_properties']>

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly'
