/**
 * Schema discovery APIs backed by node-derived system indexes.
 */

import type {
  DefinedSchema,
  SchemaIRI,
  SystemSchemaDefinitionRecord,
  SystemSchemaIndexDiagnostic,
  SystemSchemaIndexOptions,
  SystemSchemaIndexStore
} from '@xnetjs/data'
import { SchemaRegistry, SystemSchemaIndex, createNodeGraphSchemaResolver } from '@xnetjs/data'

export type SchemaDiscoveryOptions = {
  store: SystemSchemaIndexStore
  registry?: SchemaRegistry
  indexOptions?: SystemSchemaIndexOptions
  initialize?: boolean
}

export type SchemaDiscovery = {
  registry: SchemaRegistry
  index: SystemSchemaIndex
  resolveSchema(iri: SchemaIRI): Promise<DefinedSchema | undefined>
  listSchemas(): SystemSchemaDefinitionRecord[]
  getDiagnostics(): SystemSchemaIndexDiagnostic[]
  dispose(): void
}

export async function createSchemaDiscovery(
  options: SchemaDiscoveryOptions
): Promise<SchemaDiscovery> {
  const index = new SystemSchemaIndex(options.store, options.indexOptions)
  const registry = options.registry ?? new SchemaRegistry()

  if (options.initialize !== false) {
    await index.initialize()
  }

  registry.setRemoteResolver(createNodeGraphSchemaResolver(index))

  return {
    registry,
    index,
    resolveSchema: (iri) => registry.get(iri),
    listSchemas: () => index.listDefinitions(),
    getDiagnostics: () => index.getDiagnostics(),
    dispose: () => index.dispose()
  }
}
