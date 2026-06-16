/**
 * ImportBatchSchema — provenance for a statement import (exploration 0187).
 *
 * Every transaction created from a CSV/OFX/QIF file (or, later, a bank-sync
 * refresh) links back to the ImportBatch that produced it, so an import can be
 * reviewed or rolled back as a unit and re-imports can be de-duplicated.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, date, number, select, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const IMPORT_BATCH_SCHEMA_IRI = 'xnet://xnet.fyi/ImportBatch@1.0.0'

export const ImportBatchSchema = defineSchema({
  name: 'ImportBatch',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Where the rows came from. */
    source: select({
      options: [
        { id: 'csv', name: 'CSV' },
        { id: 'ofx', name: 'OFX / QFX' },
        { id: 'qif', name: 'QIF' },
        { id: 'bank', name: 'Bank sync' },
        { id: 'manual', name: 'Manual' }
      ] as const,
      default: 'csv'
    }),

    /** Original file name, if any. */
    filename: text({ maxLength: 500 }),

    /** When the import ran (Unix ms). */
    importedAt: date({ required: true }),

    /** The account the statement was imported into. */
    account: relation({ target: 'xnet://xnet.fyi/Account@1.0.0' as const }),

    /** Number of transactions created in this batch. */
    count: number({ integer: true, min: 0 }),

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

/** An ImportBatch node type (inferred from schema). */
export type ImportBatch = InferNode<(typeof ImportBatchSchema)['_properties']>

export type ImportSource = 'csv' | 'ofx' | 'qif' | 'bank' | 'manual'
