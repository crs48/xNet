/**
 * @xnet/hub - Schema registry service.
 */

import type { HubStorage, SchemaRecord } from '../storage/interface'

export type SchemaPropertyDefinition = {
  '@id': string
  name: string
  type: string
  required: boolean
  config?: Record<string, unknown>
}

export type SchemaDefinition = {
  '@id': string
  '@type': string
  name: string
  namespace: string
  properties: SchemaPropertyDefinition[]
  extends?: string
  document?: string
}

export interface SchemaDefinitionInput {
  /** Full schema IRI (e.g., xnet://did:key:z6Mk.../Recipe) */
  iri: string
  /** Version number (must be > current latest) */
  version: number
  /** Schema name (human-readable) */
  name: string
  /** Description */
  description?: string
  /** Full schema definition (properties, etc.) */
  definition: Record<string, unknown>
}

export type SchemaPublisher = {
  did: string
  canAdmin: boolean
}

export type SchemaSeed = {
  definition: SchemaDefinition
  name?: string
  description?: string
  version?: number
  authorDid?: string
}

const SCHEMA_TYPE = 'xnet://xnet.fyi/Schema'

const KNOWN_CONFIG_KEYS = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'placeholder',
  'options',
  'default',
  'includeTime',
  'multiple',
  'target',
  'accept',
  'maxSize',
  'label',
  'auto',
  'readonly'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const sanitizeSearchQuery = (query: string): string =>
  query
    .replace(/[;{}[\]\\]/g, '')
    .replace(/\b(NEAR|COLUMN)\b/gi, '')
    .trim()
    .slice(0, 500)

const extractAuthority = (iri: string): string => {
  const stripped = iri.replace('xnet://', '')
  const slashIdx = stripped.indexOf('/')
  return slashIdx >= 0 ? stripped.slice(0, slashIdx) : stripped
}

const extractNamespace = (iri: string): string => {
  const stripped = iri.replace('xnet://', '')
  const slashIdx = stripped.indexOf('/')
  if (slashIdx === -1) return `${iri}/`
  return `xnet://${stripped.slice(0, slashIdx)}/`
}

const isBuiltInAuthority = (authority: string): boolean =>
  authority === 'xnet.fyi' || authority === 'xnet.dev'

const normalizeProperties = (value: unknown, iri: string): SchemaPropertyDefinition[] => {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new SchemaError('INVALID_DEFINITION', `Property at index ${index} must be an object`)
      }
      const name = typeof entry.name === 'string' ? entry.name : ''
      const type = typeof entry.type === 'string' ? entry.type : ''
      if (!name || !type) {
        throw new SchemaError('INVALID_DEFINITION', `Property at index ${index} must include name/type`)
      }
      const required = typeof entry.required === 'boolean' ? entry.required : false
      const rawConfig = isRecord(entry.config)
        ? entry.config
        : Object.fromEntries(
            Object.entries(entry).filter(([key]) => KNOWN_CONFIG_KEYS.has(key))
          )
      const config = Object.keys(rawConfig).length > 0 ? rawConfig : undefined
      return {
        '@id': typeof entry['@id'] === 'string' ? entry['@id'] : `${iri}#${name}`,
        name,
        type,
        required,
        ...(config ? { config } : {})
      }
    })
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([name, entry]) => {
      if (!isRecord(entry)) {
        throw new SchemaError('INVALID_DEFINITION', `Property '${name}' must be an object`)
      }
      const type = typeof entry.type === 'string' ? entry.type : ''
      if (!type) {
        throw new SchemaError('INVALID_DEFINITION', `Property '${name}' must include type`)
      }
      const required = typeof entry.required === 'boolean' ? entry.required : false
      const config = isRecord(entry.config)
        ? entry.config
        : Object.fromEntries(
            Object.entries(entry).filter(([key]) => KNOWN_CONFIG_KEYS.has(key))
          )

      return {
        '@id': typeof entry['@id'] === 'string' ? entry['@id'] : `${iri}#${name}`,
        name,
        type,
        required,
        ...(Object.keys(config).length > 0 ? { config } : {})
      }
    })
  }

  throw new SchemaError('INVALID_DEFINITION', 'Schema definition must include properties')
}

const normalizeDefinition = (input: SchemaDefinitionInput): SchemaDefinition => {
  if (!isRecord(input.definition)) {
    throw new SchemaError('INVALID_DEFINITION', 'Schema definition must be an object')
  }

  const raw = input.definition
  const iri =
    (typeof raw['@id'] === 'string' && raw['@id']) ||
    (typeof raw.iri === 'string' && raw.iri) ||
    input.iri

  if (iri !== input.iri) {
    throw new SchemaError('INVALID_DEFINITION', 'Schema definition IRI does not match input')
  }

  const name = typeof raw.name === 'string' && raw.name ? raw.name : input.name
  const namespace =
    typeof raw.namespace === 'string' && raw.namespace ? raw.namespace : extractNamespace(iri)
  const properties = normalizeProperties(raw.properties, iri)

  const definition: SchemaDefinition = {
    '@id': iri,
    '@type': typeof raw['@type'] === 'string' ? raw['@type'] : SCHEMA_TYPE,
    name,
    namespace,
    properties
  }

  if (typeof raw.extends === 'string') {
    definition.extends = raw.extends
  }
  if (typeof raw.document === 'string') {
    definition.document = raw.document
  }

  return definition
}

export class SchemaRegistryService {
  constructor(private storage: HubStorage) {}

  /**
   * Publish a new schema version.
   * Verifies the publisher owns the schema namespace.
   */
  async publish(input: SchemaDefinitionInput, publisher: SchemaPublisher): Promise<SchemaRecord> {
    if (!input.iri.startsWith('xnet://')) {
      throw new SchemaError('INVALID_IRI', 'Schema IRI must start with xnet://')
    }

    const authority = extractAuthority(input.iri)
    if (!authority) {
      throw new SchemaError('INVALID_IRI', 'Schema IRI must include an authority')
    }

    const isDidAuthority = authority.startsWith('did:')
    if (isBuiltInAuthority(authority)) {
      if (!publisher.canAdmin) {
        throw new SchemaError('UNAUTHORIZED', `Publishing to ${authority} requires admin rights`)
      }
    } else if (isDidAuthority && authority !== publisher.did && !publisher.canAdmin) {
      throw new SchemaError(
        'UNAUTHORIZED',
        `Publisher ${publisher.did} cannot publish to namespace ${authority}`
      )
    }

    if (!Number.isFinite(input.version) || input.version <= 0) {
      throw new SchemaError('INVALID_DEFINITION', 'Schema version must be a positive integer')
    }

    const existing = await this.storage.getSchema(input.iri)
    if (existing && input.version <= existing.version) {
      throw new SchemaError(
        'VERSION_CONFLICT',
        `Version ${input.version} must be greater than current ${existing.version}`
      )
    }

    const definition = normalizeDefinition(input)
    const record: SchemaRecord = {
      iri: definition['@id'],
      version: input.version,
      definition,
      authorDid: publisher.did,
      name: definition.name,
      description: input.description ?? '',
      propertiesCount: definition.properties.length,
      createdAt: Date.now()
    }

    await this.storage.putSchema(record)
    return record
  }

  /**
   * Resolve a schema by IRI. Returns the latest version.
   */
  async resolve(iri: string, version?: number): Promise<SchemaRecord | null> {
    return this.storage.getSchema(iri, version)
  }

  /**
   * Search for schemas by keyword.
   */
  async search(
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SchemaRecord[]> {
    const safeQuery = sanitizeSearchQuery(query)
    if (!safeQuery) return []
    return this.storage.searchSchemas(safeQuery, options)
  }

  /**
   * List schemas published by a specific author.
   */
  async listByAuthor(authorDid: string): Promise<SchemaRecord[]> {
    return this.storage.listSchemasByAuthor(authorDid)
  }

  /**
   * List popular/featured schemas.
   */
  async listPopular(limit = 20): Promise<SchemaRecord[]> {
    return this.storage.listPopularSchemas(limit)
  }

  /**
   * Seed built-in schemas if they are not present.
   */
  async seedBuiltInSchemas(seeds: SchemaSeed[]): Promise<void> {
    for (const seed of seeds) {
      const iri = seed.definition['@id']
      if (!iri) continue
      const existing = await this.storage.getSchema(iri)
      const version = seed.version ?? 1
      if (existing && existing.version >= version) continue

      const record: SchemaRecord = {
        iri,
        version,
        definition: seed.definition,
        authorDid: seed.authorDid ?? 'did:key:xnet',
        name: seed.name ?? seed.definition.name,
        description: seed.description ?? '',
        propertiesCount: seed.definition.properties.length,
        createdAt: Date.now()
      }

      await this.storage.putSchema(record)
    }
  }
}

export class SchemaError extends Error {
  constructor(
    public code:
      | 'INVALID_IRI'
      | 'UNAUTHORIZED'
      | 'VERSION_CONFLICT'
      | 'INVALID_DEFINITION'
      | 'NOT_FOUND',
    message: string
  ) {
    super(message)
    this.name = 'SchemaError'
  }
}
