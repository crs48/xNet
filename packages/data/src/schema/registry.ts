/**
 * Schema Registry - Runtime lookup for schema definitions.
 *
 * The registry provides:
 * - Registration of custom schemas
 * - Lookup by schema IRI
 * - Lazy loading of built-in schemas
 * - Validation that a node matches its schema
 */

import type { SchemaIRI } from './node'
import type { DefinedSchema, PropertyBuilder } from './types'
import { builtInSchemas, type BuiltInSchemaIRI } from './schemas'

/**
 * A registered schema entry.
 */
interface SchemaEntry {
  /** The defined schema */
  schema: DefinedSchema<Record<string, PropertyBuilder>>
  /** Whether this is a built-in schema */
  builtIn: boolean
}

/**
 * Schema Registry for runtime schema lookup.
 */
export class SchemaRegistry {
  private schemas = new Map<SchemaIRI, SchemaEntry>()
  private loadingPromises = new Map<SchemaIRI, Promise<DefinedSchema>>()

  /**
   * Register a custom schema.
   *
   * @param schema - The defined schema to register
   * @throws If a schema with this IRI is already registered
   */
  register<P extends Record<string, PropertyBuilder>>(schema: DefinedSchema<P>): void {
    const iri = schema.schema['@id']

    if (this.schemas.has(iri)) {
      throw new Error(`Schema already registered: ${iri}`)
    }

    this.schemas.set(iri, {
      schema: schema as unknown as DefinedSchema<Record<string, PropertyBuilder>>,
      builtIn: false
    })
  }

  /**
   * Get a schema by IRI.
   * For built-in schemas, this will lazy-load them on first access.
   *
   * @param iri - The schema IRI
   * @returns The schema, or undefined if not found
   */
  async get(iri: SchemaIRI): Promise<DefinedSchema | undefined> {
    // Check if already loaded
    const entry = this.schemas.get(iri)
    if (entry) {
      return entry.schema
    }

    // Check if it's a built-in schema that needs loading
    if (iri in builtInSchemas) {
      // Prevent duplicate loading
      const existingPromise = this.loadingPromises.get(iri)
      if (existingPromise) {
        return existingPromise
      }

      const loadPromise = builtInSchemas[iri as BuiltInSchemaIRI]().then((schema) => {
        this.schemas.set(iri, { schema, builtIn: true })
        this.loadingPromises.delete(iri)
        return schema
      })

      this.loadingPromises.set(iri, loadPromise)
      return loadPromise
    }

    return undefined
  }

  /**
   * Get a schema synchronously (only works for already-loaded schemas).
   *
   * @param iri - The schema IRI
   * @returns The schema, or undefined if not loaded
   */
  getSync(iri: SchemaIRI): DefinedSchema | undefined {
    return this.schemas.get(iri)?.schema
  }

  /**
   * Check if a schema is registered (either loaded or built-in).
   */
  has(iri: SchemaIRI): boolean {
    return this.schemas.has(iri) || iri in builtInSchemas
  }

  /**
   * Check if a schema is a built-in schema.
   */
  isBuiltIn(iri: SchemaIRI): boolean {
    return iri in builtInSchemas
  }

  /**
   * Get all registered schema IRIs (including built-in).
   */
  getAllIRIs(): SchemaIRI[] {
    const iris = new Set<SchemaIRI>([
      ...this.schemas.keys(),
      ...(Object.keys(builtInSchemas) as SchemaIRI[])
    ])
    return Array.from(iris)
  }

  /**
   * Unregister a custom schema.
   * Built-in schemas cannot be unregistered.
   *
   * @param iri - The schema IRI to unregister
   * @returns true if the schema was unregistered
   */
  unregister(iri: SchemaIRI): boolean {
    const entry = this.schemas.get(iri)
    if (!entry || entry.builtIn) {
      return false
    }
    this.schemas.delete(iri)
    return true
  }

  /**
   * Clear all custom schemas (keeps built-in schemas).
   */
  clear(): void {
    for (const [iri, entry] of this.schemas) {
      if (!entry.builtIn) {
        this.schemas.delete(iri)
      }
    }
  }
}

/**
 * Default global schema registry instance.
 */
export const schemaRegistry = new SchemaRegistry()
