/**
 * SchemaExtension / ExtensionField — user- and org-defined attributes on an
 * existing (typically built-in) schema.
 *
 * Where a free-form `Database` declares its columns as `DatabaseField` nodes
 * keyed to a `database`, a `SchemaExtension` declares *additional* columns for
 * an existing schema (e.g. `Contact`, `Task`) keyed to a `targetSchema`. Each
 * `ExtensionField` mirrors the `DatabaseField` shape (name / type / config /
 * sortKey) so the same column tooling can render it.
 *
 * The fields it declares surface on nodes of the target schema as namespaced
 * `ext:<authority>/<field>` properties (see `../extension.ts`), composed onto
 * the core schema by `buildEffectiveSchema` (see `../effective-schema.ts`).
 *
 * Like `SpaceMembership` and `Grant`, the extension uses a deterministic id so
 * re-declaring the extension for the same `(authority, targetSchema)` upserts
 * instead of forking a second overlay.
 */

import type { SchemaIRI } from '../node'
import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, number, json } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const SCHEMA_EXTENSION_SCHEMA_IRI = 'xnet://xnet.fyi/SchemaExtension@1.0.0' as SchemaIRI
export const EXTENSION_FIELD_SCHEMA_IRI = 'xnet://xnet.fyi/ExtensionField@1.0.0' as SchemaIRI

export const SchemaExtensionSchema = defineSchema({
  name: 'SchemaExtension',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Versioned IRI of the schema being extended, e.g. 'xnet://xnet.fyi/Contact@1.0.0' */
    targetSchema: text({ required: true, maxLength: 300 }),

    /**
     * Namespace authority that owns these fields — a Space id, a DID, or a
     * domain. Becomes the `<authority>` segment of every `ext:` key, so two
     * tenants extending the same schema never collide.
     */
    authority: text({ required: true, maxLength: 200 }),

    /** Human-readable label for the extension set (e.g. "Acme CRM fields") */
    label: text({ maxLength: 200 }),

    /** Optional owning Space — drives the authorization cascade for this overlay */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const })
  },
  authorization: spaceCascadeAuthorization()
})

export const ExtensionFieldSchema = defineSchema({
  name: 'ExtensionField',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Parent SchemaExtension */
    extension: relation({ target: SCHEMA_EXTENSION_SCHEMA_IRI, required: true }),

    /** Field token — the `<field>` segment of the `ext:<authority>/<field>` key */
    name: text({ required: true, maxLength: 200 }),

    /** Field type (FieldType union, enforced in field-operations) */
    type: text({ required: true, maxLength: 50 }),

    /** Type-specific configuration (FieldConfig) */
    config: json<Record<string, unknown>>({}),

    /** Fractional index for ordering among a schema's extension fields */
    sortKey: text({ required: true }),

    /** Default column width in pixels (table views) */
    width: number({ min: 40, integer: true }),

    /** Optional owning Space — mirrors the parent extension's cascade */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const })
  },
  authorization: spaceCascadeAuthorization()
})

/** A SchemaExtension node (inferred from schema). */
export type SchemaExtension = InferNode<(typeof SchemaExtensionSchema)['_properties']>

/** An ExtensionField node (inferred from schema). */
export type ExtensionField = InferNode<(typeof ExtensionFieldSchema)['_properties']>

/**
 * Deterministic id for a SchemaExtension so re-declaring the overlay for the
 * same `(authority, targetSchema)` upserts. Mirrors `spaceMembershipId`.
 */
export function schemaExtensionId(authority: string, targetSchema: string): string {
  return `schemaext:${authority}:${targetSchema}`
}
