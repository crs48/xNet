/**
 * Schema Registry - Runtime lookup for schema definitions.
 *
 * The registry provides:
 * - Registration of custom schemas
 * - Lookup by schema IRI
 * - Lazy loading of built-in schemas
 * - Validation that a node matches its schema
 */

import type { SchemaIRI, Node } from './node'
import type {
  CreateNodeOptions,
  DefinedSchema,
  InferCreateProps,
  InferNode,
  PropertyBuilder,
  PropertyDefinition,
  Schema,
  ValidationError,
  ValidationResult
} from './types'
import type { SelectOption } from './properties'
import { createNodeId } from './node'
import { builtInSchemas, type BuiltInSchemaIRI } from './schemas'
import {
  checkbox,
  created,
  createdBy,
  date,
  dateRange,
  email,
  file,
  multiSelect,
  number,
  person,
  relation,
  select,
  text,
  updated,
  url
} from './properties'

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
  private loadingPromises = new Map<SchemaIRI, Promise<DefinedSchema | undefined>>()
  private remoteResolver: ((iri: SchemaIRI) => Promise<Schema | null>) | null = null

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

    if (this.remoteResolver) {
      const existingPromise = this.loadingPromises.get(iri)
      if (existingPromise) {
        return existingPromise
      }

      const loadPromise = this.remoteResolver(iri)
        .then((definition) => {
          if (!definition) return undefined
          const parsed = parseSchemaDefinition(definition)
          if (!parsed) return undefined
          this.schemas.set(iri, { schema: parsed, builtIn: false })
          return parsed
        })
        .catch(() => undefined)
        .finally(() => {
          this.loadingPromises.delete(iri)
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

  /**
   * Set a remote resolver for fetching schemas by IRI.
   * When a schema is not found locally, the resolver is queried.
   */
  setRemoteResolver(resolver: (iri: SchemaIRI) => Promise<Schema | null>): void {
    this.remoteResolver = resolver
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const toBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const toStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined

const toRegExp = (value: unknown): RegExp | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    return new RegExp(value)
  } catch {
    return undefined
  }
}

const normalizeSelectOptions = (value: unknown): SelectOption[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      ...(typeof entry.color === 'string' ? { color: entry.color } : {})
    }))
    .filter((entry) => entry.id.length > 0 && entry.name.length > 0)
}

const normalizePropertyDefinition = (
  definition: PropertyDefinition,
  schemaId: SchemaIRI
): PropertyDefinition | null => {
  const name = typeof definition.name === 'string' ? definition.name : ''
  const type = typeof definition.type === 'string' ? definition.type : ''
  if (!name || !type) return null

  return {
    '@id': typeof definition['@id'] === 'string' ? definition['@id'] : `${schemaId}#${name}`,
    name,
    type: definition.type,
    required: typeof definition.required === 'boolean' ? definition.required : false,
    ...(isRecord(definition.config) ? { config: definition.config } : {})
  }
}

const buildPropertyBuilder = (definition: PropertyDefinition): PropertyBuilder | null => {
  const config = isRecord(definition.config) ? definition.config : {}
  const required = typeof definition.required === 'boolean' ? definition.required : false

  switch (definition.type) {
    case 'text':
      return text({
        required,
        minLength: toNumber(config.minLength),
        maxLength: toNumber(config.maxLength),
        pattern: toRegExp(config.pattern),
        placeholder: toStringValue(config.placeholder)
      })
    case 'number':
      return number({
        required,
        min: toNumber(config.min),
        max: toNumber(config.max),
        integer: toBoolean(config.integer)
      })
    case 'checkbox':
      return checkbox({
        required,
        default: toBoolean(config.default)
      })
    case 'date':
      return date({
        required,
        includeTime: toBoolean(config.includeTime)
      })
    case 'dateRange':
      return dateRange({
        required,
        includeTime: toBoolean(config.includeTime)
      })
    case 'select': {
      const options = normalizeSelectOptions(config.options)
      return select({
        options: options as SelectOption[],
        required,
        default: toStringValue(config.default) as SelectOption['id'] | undefined
      })
    }
    case 'multiSelect': {
      const options = normalizeSelectOptions(config.options)
      const defaultValue = toStringArray(config.default)
      return multiSelect({
        options: options as SelectOption[],
        required,
        default: defaultValue as SelectOption['id'][] | undefined
      })
    }
    case 'person':
      return person({
        required,
        multiple: toBoolean(config.multiple)
      })
    case 'relation':
      return relation({
        required,
        multiple: toBoolean(config.multiple),
        target: toStringValue(config.target) as SchemaIRI | undefined
      })
    case 'url':
      return url({
        required,
        placeholder: toStringValue(config.placeholder)
      })
    case 'email':
      return email({
        required,
        placeholder: toStringValue(config.placeholder)
      })
    case 'phone':
      return phone({
        required,
        placeholder: toStringValue(config.placeholder)
      })
    case 'file':
      return file({
        required,
        multiple: toBoolean(config.multiple),
        accept: toStringArray(config.accept),
        maxSize: toNumber(config.maxSize)
      })
    case 'created':
      return created({
        label: toStringValue(config.label)
      })
    case 'updated':
      return updated({
        label: toStringValue(config.label)
      })
    case 'createdBy':
      return createdBy({
        label: toStringValue(config.label)
      })
    default:
      return null
  }
}

const createDefinedSchema = <TProperties extends Record<string, PropertyBuilder>>(
  schema: Schema,
  properties: TProperties
): DefinedSchema<TProperties> => {
  const schemaId = schema['@id']

  const validate = (node: unknown): ValidationResult => {
    const errors: ValidationError[] = []

    if (typeof node !== 'object' || node === null) {
      return { valid: false, errors: [{ path: '', message: 'Node must be an object' }] }
    }

    const obj = node as Record<string, unknown>

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

    for (const [name, builder] of Object.entries(properties)) {
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

  const create = (
    props: InferCreateProps<TProperties>,
    createOptions: CreateNodeOptions
  ): InferNode<TProperties> => {
    const now = createOptions.createdAt ?? Date.now()
    const id = createOptions.id ?? createNodeId()

    const node: Record<string, unknown> = {
      id,
      schemaId,
      createdAt: now,
      createdBy: createOptions.createdBy
    }

    for (const [name, builder] of Object.entries(properties)) {
      const rawValue = (props as Record<string, unknown>)[name]
      const coerced = builder.coerce(rawValue)
      if (coerced !== null) {
        node[name] = coerced
      }
    }

    return node as InferNode<TProperties>
  }

  const is = (node: Node): node is InferNode<TProperties> => node.schemaId === schemaId

  return {
    schema,
    validate,
    create,
    is,
    _schemaId: schemaId,
    _properties: properties
  }
}

const parseSchemaDefinition = (definition: Schema): DefinedSchema | undefined => {
  if (!definition || typeof definition !== 'object') return undefined
  if (typeof definition['@id'] !== 'string') return undefined
  if (!Array.isArray(definition.properties)) return undefined

  const schemaId = definition['@id'] as SchemaIRI
  const properties = definition.properties
    .map((prop) => normalizePropertyDefinition(prop, schemaId))
    .filter((prop): prop is PropertyDefinition => prop !== null)

  if (properties.length === 0) return undefined

  const propertyBuilders: Record<string, PropertyBuilder> = {}
  for (const property of properties) {
    const builder = buildPropertyBuilder(property)
    if (!builder) return undefined
    propertyBuilders[property.name] = builder
  }

  const normalizedSchema: Schema = {
    ...definition,
    properties
  }

  return createDefinedSchema(normalizedSchema, propertyBuilders)
}

/**
 * Default global schema registry instance.
 */
export const schemaRegistry = new SchemaRegistry()
