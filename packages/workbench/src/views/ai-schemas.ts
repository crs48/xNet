/**
 * Adapt the client `schemaRegistry` (@xnetjs/data) to the `SchemaRegistryAPI`
 * shape the AiSurfaceService expects (exploration 0192, Phase 1).
 *
 * The client's `DefinedSchema` keeps its metadata under `.schema` and exposes
 * properties as an array; the surface wants a flat `{ iri, name, properties }`
 * with properties keyed by name. The mapping is pure + tested; the registry
 * wiring is a thin wrapper over the global singleton.
 */

import type { SchemaData, SchemaRegistryAPI } from '@xnetjs/plugins'
import { schemaRegistry, type SchemaIRI } from '@xnetjs/data'

/** The minimal shape of a client schema we read (a `DefinedSchema` satisfies it). */
export interface DefinedSchemaLike {
  schema: {
    '@id': string
    name: string
    properties: Array<{ name: string }>
  }
}

/** Flatten a client schema into the surface's `SchemaData` (properties by name). */
export function toSchemaData(defined: DefinedSchemaLike): SchemaData {
  const { schema } = defined
  return {
    iri: schema['@id'],
    name: schema.name,
    properties: Object.fromEntries(schema.properties.map((property) => [property.name, property]))
  }
}

/** A `SchemaRegistryAPI` backed by the global client schema registry. */
export function schemaRegistryApi(): SchemaRegistryAPI {
  return {
    getAllIRIs: () => schemaRegistry.getAllIRIs(),
    get: async (iri) => {
      const defined = await schemaRegistry.get(iri as SchemaIRI)
      return defined ? toSchemaData(defined) : null
    }
  }
}
