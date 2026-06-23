/**
 * ExternalItemSchema — a generic object synced from a third-party API
 * (exploration 0213).
 *
 * The "collapse onto a few receivers" thesis: rather than a bespoke schema pack
 * per service, the API pull connectors (GitHub issues/PRs, Notion pages,
 * Airtable records, Linear issues) all materialize into one governed node type.
 * `source` + `kind` keep the provenance; `externalId` de-duplicates re-syncs;
 * `raw` preserves the original payload for fidelity. Fidelity-per-service can be
 * promoted to dedicated schemas later without changing the connector contract.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, date, json, relation, select, text, url } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const EXTERNAL_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/ExternalItem@1.0.0'

/** The services that materialize ExternalItem nodes. */
export const EXTERNAL_ITEM_SOURCES = [
  { id: 'github', name: 'GitHub' },
  { id: 'notion', name: 'Notion' },
  { id: 'airtable', name: 'Airtable' },
  { id: 'linear', name: 'Linear' },
  { id: 'other', name: 'Other' }
] as const

export const ExternalItemSchema = defineSchema({
  name: 'ExternalItem',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Originating service. */
    source: select({ options: EXTERNAL_ITEM_SOURCES, required: true }),

    /** Service-specific object kind, e.g. `issue`, `pull_request`, `page`, `record`. */
    kind: text({ required: true, maxLength: 100 }),

    /** Stable id in the source system, used to de-duplicate re-syncs. */
    externalId: text({ required: true, maxLength: 500 }),

    /** Display title. */
    title: text({ required: true, maxLength: 1000 }),

    /** Canonical link back to the source object. */
    url: url({}),

    /** Body / description text. */
    body: text({}),

    /** Free-form status string from the source (e.g. `open`, `closed`, `done`). */
    status: text({ maxLength: 100 }),

    /** When the source object was last updated (Unix ms). */
    updatedAt: date({ includeTime: true }),

    /** The original payload, preserved for fidelity. */
    raw: json({}),

    /** The home Space — drives the authorization cascade. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type ExternalItem = InferNode<(typeof ExternalItemSchema)['_properties']>
