/**
 * Schema types for xNet's code-first schema system.
 */

import type { SchemaIRI, DID, Node } from './node'

/**
 * Property type identifiers.
 */
export type PropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect'
  | 'person'
  | 'relation'
  | 'rollup'
  | 'formula'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  | 'created'
  | 'updated'
  | 'createdBy'

/**
 * Base property definition stored in a schema.
 */
export interface PropertyDefinition {
  /** Property IRI (e.g., 'xnet://xnet.fyi/Task#title') */
  '@id': string
  /** Property name */
  name: string
  /** Property type */
  type: PropertyType
  /** Whether this property is required */
  required: boolean
  /** Type-specific configuration */
  config?: Record<string, unknown>
}

/**
 * A property builder returned by property helper functions.
 * Contains both the definition and runtime validation/coercion.
 */
export interface PropertyBuilder<T = unknown> {
  /** The property definition for schema storage */
  definition: Omit<PropertyDefinition, '@id' | 'name'>
  /** Validate a value against this property type */
  validate(value: unknown): value is T
  /** Coerce a value to this property type (returns null if invalid) */
  coerce(value: unknown): T | null
  /** TypeScript type marker (never used at runtime) */
  _type: T
}

/**
 * CRDT document type for collaborative content.
 *
 * When a schema specifies a document type, nodes of that schema
 * have an associated CRDT document that syncs via the CRDT's
 * native protocol (e.g., y-webrtc for Yjs).
 *
 * - 'yjs': Yjs Y.Doc for collaborative rich text, canvas, etc.
 * - 'automerge': Automerge document (future support)
 */
export type DocumentType = 'yjs' | 'automerge'

/**
 * Schema definition stored as JSON-LD.
 */
export interface Schema {
  /** Schema IRI */
  '@id': SchemaIRI
  /** Type marker for JSON-LD */
  '@type': 'xnet://xnet.fyi/Schema'
  /** Human-readable name */
  name: string
  /** Namespace for this schema */
  namespace: string
  /**
   * Schema version in semver format.
   * Included in IRI as `@version` suffix.
   */
  version: string
  /**
   * Previous schema IRI to migrate from.
   * Used for automatic migration path discovery.
   */
  migrateFrom?: SchemaIRI
  /** Property definitions */
  properties: PropertyDefinition[]
  /** Parent schema IRI (for inheritance) */
  extends?: SchemaIRI
  /**
   * CRDT document type for collaborative content.
   * When set, nodes of this schema have an associated CRDT document
   * that syncs separately from properties (which use LWW).
   */
  document?: DocumentType
}

/**
 * Validation result from schema validation.
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * A single validation error.
 */
export interface ValidationError {
  path: string
  message: string
  value?: unknown
}

/**
 * Options for creating a node from a schema.
 */
export interface CreateNodeOptions {
  /** Override the generated ID */
  id?: string
  /** The creator's DID */
  createdBy: DID
  /** Override the creation timestamp */
  createdAt?: number
}

/**
 * A defined schema with runtime methods.
 */
export interface DefinedSchema<
  TProperties extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  /** The schema definition (JSON-LD compatible) */
  schema: Schema

  /** Validate a node against this schema */
  validate(node: unknown): ValidationResult

  /** Create a new node of this schema type */
  create(
    properties: InferCreateProps<TProperties>,
    options: CreateNodeOptions
  ): InferNode<TProperties>

  /** Type guard - check if a node matches this schema */
  is(node: Node): node is InferNode<TProperties>

  /** Schema IRI for type inference */
  readonly _schemaId: SchemaIRI

  /** Property builders for type inference */
  readonly _properties: TProperties
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Infer the TypeScript type from a property builder.
 */
export type InferPropertyType<B> = B extends PropertyBuilder<infer T> ? T : never

/**
 * Infer required properties from a record of property builders.
 */
type RequiredKeys<P extends Record<string, PropertyBuilder>> = {
  [K in keyof P]: P[K]['definition']['required'] extends true ? K : never
}[keyof P]

/**
 * Infer optional properties from a record of property builders.
 */
type OptionalKeys<P extends Record<string, PropertyBuilder>> = {
  [K in keyof P]: P[K]['definition']['required'] extends true ? never : K
}[keyof P]

/**
 * Infer the properties type from property builders.
 */
export type InferProperties<P extends Record<string, PropertyBuilder>> = {
  [K in RequiredKeys<P>]: InferPropertyType<P[K]>
} & {
  [K in OptionalKeys<P>]?: InferPropertyType<P[K]>
}

/**
 * Infer the create props (what you pass to create()).
 * Same as InferProperties but allows undefined for optional fields.
 */
export type InferCreateProps<P extends Record<string, PropertyBuilder>> = {
  [K in RequiredKeys<P>]: InferPropertyType<P[K]>
} & {
  [K in OptionalKeys<P>]?: InferPropertyType<P[K]> | undefined
}

/**
 * Infer the full Node type from property builders.
 */
export type InferNode<P extends Record<string, PropertyBuilder>> = {
  id: string
  schemaId: SchemaIRI
  createdAt: number
  createdBy: DID
} & InferProperties<P>
