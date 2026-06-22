/**
 * Derive the brain's `relationFieldsOf` resolver from schema definitions
 * (exploration 0211, Phase 2). The graph-walk in `retrieve()` needs to know which
 * properties of a node are relations; rather than make every consumer hand-write
 * that map, this reads it straight off the compiled schemas.
 *
 * Kept structural (no `@xnetjs/data` import) so the brain stays decoupled — any
 * object shaped like a defined schema works, including the built-in registry.
 */
import type { RelationFieldsResolver } from './expand'

/** The minimal compiled-schema shape the resolver reads. */
export interface SchemaLike {
  schema: {
    '@id': string
    properties: ReadonlyArray<{ name: string; type: string }>
  }
}

/** The relation-valued property names of a single schema. */
export function schemaRelationFields(schema: SchemaLike): string[] {
  return schema.schema.properties.filter((p) => p.type === 'relation').map((p) => p.name)
}

/**
 * Build a `RelationFieldsResolver` from a set of defined schemas. Precomputes the
 * relation fields per schema `@id`; unknown schemas resolve to `[]` (no edges).
 *
 * @example
 * ```ts
 * import { builtInSchemaList } from '@xnetjs/data' // or your resolved registry
 * const relationFieldsOf = relationFieldsResolver(builtInSchemaList)
 * createBrain({ store, semanticSearch, relationFieldsOf })
 * ```
 */
export function relationFieldsResolver(schemas: Iterable<SchemaLike>): RelationFieldsResolver {
  const byId = new Map<string, string[]>()
  for (const schema of schemas) {
    byId.set(schema.schema['@id'], schemaRelationFields(schema))
  }
  return (schemaId: string): readonly string[] => byId.get(schemaId) ?? []
}
