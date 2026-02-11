/**
 * defineSchema - Create a schema definition with TypeScript inference.
 */

import type { SchemaIRI, Node } from './node'
import type {
  Schema,
  DocumentType,
  PropertyBuilder,
  PropertyDefinition,
  DefinedSchema,
  ValidationResult,
  ValidationError,
  CreateNodeOptions,
  InferCreateProps,
  InferNode
} from './types'
import type { AuthorizationDefinition } from '@xnet/core'
import { validateAuthorization, serializeAuthorization } from '../auth'
import { createNodeId } from './node'

/**
 * Default schema version when not specified.
 */
export const DEFAULT_SCHEMA_VERSION = '1.0.0'

/**
 * Options for defining a schema.
 */
export interface DefineSchemaOptions<
  P extends Record<string, PropertyBuilder>,
  A extends AuthorizationDefinition = AuthorizationDefinition
> {
  /** Schema name (e.g., 'Task', 'Page') */
  name: string
  /** Namespace (e.g., 'xnet://xnet.fyi/') */
  namespace: `xnet://${string}/`
  /**
   * Schema version in semver format (e.g., '1.0.0', '2.1.0').
   * Used for schema evolution and migration paths.
   *
   * Defaults to '1.0.0' if not specified.
   *
   * The version is included in the SchemaIRI:
   * - Without version: `xnet://xnet.fyi/Task` (treated as @1.0.0)
   * - With version: `xnet://xnet.fyi/Task@2.0.0`
   */
  version?: string
  /**
   * Previous schema version to migrate from.
   * Used to define automatic migration paths.
   *
   * Example: `xnet://xnet.fyi/Task@1.0.0`
   */
  migrateFrom?: SchemaIRI
  /** Property definitions */
  properties: P
  /** Parent schema to extend */
  extends?: DefinedSchema<Record<string, PropertyBuilder>>
  /**
   * CRDT document type for collaborative content.
   * - 'yjs': Yjs Y.Doc for rich text, canvas, etc.
   * - 'automerge': Automerge document (future)
   * - undefined: No document, properties only
   */
  document?: DocumentType

  /**
   * Authorization rules for this schema.
   * When present, nodes are subject to encrypted access control.
   */
  authorization?: A
}

/**
 * Define a schema with full TypeScript inference.
 *
 * @example
 * ```typescript
 * const TaskSchema = defineSchema({
 *   name: 'Task',
 *   namespace: 'xnet://xnet.fyi/',
 *   properties: {
 *     title: text({ required: true }),
 *     status: select({ options: ['todo', 'done'] as const }),
 *     dueDate: date({})
 *   },
 *   document: 'yjs'  // Enable collaborative Y.Doc
 * })
 *
 * type Task = InferNode<typeof TaskSchema['_properties']>
 * ```
 */
export function defineSchema<P extends Record<string, PropertyBuilder>>(
  options: DefineSchemaOptions<P>
): DefinedSchema<P> {
  const version = options.version ?? DEFAULT_SCHEMA_VERSION
  // Build versioned SchemaIRI: xnet://namespace/Name@version
  // For default version 1.0.0, we still include it for consistency
  const schemaId = `${options.namespace}${options.name}@${version}` as SchemaIRI

  // ─── Dev-time warning: detect text() properties that look like references ───
  if (process.env.NODE_ENV !== 'production') {
    // Patterns that suggest a property stores a node ID or foreign key.
    // Matches: target, inReplyTo, replyToFoo, parentId, nodeRef, fooNodeId
    // Excludes: pluginId, sourceUrl, schemaId (these are identifiers, not FK refs)
    const REF_NAME_PATTERN =
      /(?:^target$|^inReplyTo$|^replyTo[A-Z].*(?:Id|Node)$|(?:parent|node|comment|task|page|database)(?:Id|Ref)$)/

    for (const [name, builder] of Object.entries(options.properties)) {
      if (builder.definition.type === 'text' && REF_NAME_PATTERN.test(name)) {
        console.warn(
          `[xNet Schema] "${options.name}.${name}" is a text() property whose name suggests it stores a reference. ` +
            `Consider using relation() for node references or person() for DIDs.`
        )
      }
    }
  }

  // Build property definitions with IRIs
  const properties: PropertyDefinition[] = Object.entries(options.properties).map(
    ([name, builder]) => ({
      '@id': `${schemaId}#${name}`,
      name,
      ...builder.definition
    })
  )

  const propertyMap = Object.fromEntries(properties.map((property) => [property.name, property]))

  if (options.authorization) {
    const authResult = validateAuthorization(options.authorization, propertyMap)
    if (!authResult.valid) {
      const message = authResult.errors
        .map((error) => `${error.path}: [${error.code}] ${error.message}`)
        .join(', ')
      throw new Error(`Invalid authorization in schema '${options.name}': ${message}`)
    }
  }

  // The schema definition (JSON-LD compatible)
  const schema: Schema = {
    '@id': schemaId,
    '@type': 'xnet://xnet.fyi/Schema',
    name: options.name,
    namespace: options.namespace,
    version,
    migrateFrom: options.migrateFrom,
    properties,
    extends: options.extends?.schema['@id'],
    document: options.document,
    authorization: options.authorization ? serializeAuthorization(options.authorization) : undefined
  }

  // Validation function
  function validate(node: unknown): ValidationResult {
    const errors: ValidationError[] = []

    if (typeof node !== 'object' || node === null) {
      return { valid: false, errors: [{ path: '', message: 'Node must be an object' }] }
    }

    const obj = node as Record<string, unknown>

    // Check required base fields
    if (typeof obj.id !== 'string') {
      errors.push({ path: 'id', message: 'id is required and must be a string' })
    }
    if (obj.schemaId !== schemaId) {
      errors.push({
        path: 'schemaId',
        message: `schemaId must be '${schemaId}'`,
        value: obj.schemaId
      })
    }
    if (typeof obj.createdAt !== 'number') {
      errors.push({ path: 'createdAt', message: 'createdAt is required and must be a number' })
    }
    if (typeof obj.createdBy !== 'string' || !obj.createdBy.startsWith('did:key:')) {
      errors.push({ path: 'createdBy', message: 'createdBy must be a valid DID' })
    }

    // Validate each property
    for (const [name, builder] of Object.entries(options.properties)) {
      const value = obj[name]
      const isRequired = builder.definition.required

      if (value === undefined || value === null) {
        if (isRequired) {
          errors.push({ path: name, message: `${name} is required` })
        }
      } else if (!builder.validate(value)) {
        errors.push({ path: name, message: `${name} has invalid value`, value })
      }
    }

    return { valid: errors.length === 0, errors }
  }

  // Create function
  function create(props: InferCreateProps<P>, createOptions: CreateNodeOptions): InferNode<P> {
    const now = createOptions.createdAt ?? Date.now()
    const id = createOptions.id ?? createNodeId()

    // Start with base node fields
    const node: Record<string, unknown> = {
      id,
      schemaId,
      createdAt: now,
      createdBy: createOptions.createdBy
    }

    // Add properties (coerce values, apply defaults)
    for (const [name, builder] of Object.entries(options.properties)) {
      const rawValue = (props as Record<string, unknown>)[name]
      // Always call coerce - it handles defaults for undefined values
      const coerced = builder.coerce(rawValue)
      if (coerced !== null) {
        node[name] = coerced
      }
    }

    return node as InferNode<P>
  }

  // Type guard
  function is(node: Node): node is InferNode<P> {
    return node.schemaId === schemaId
  }

  return {
    schema,
    validate,
    create,
    is,
    _schemaId: schemaId,
    _properties: options.properties
  }
}
