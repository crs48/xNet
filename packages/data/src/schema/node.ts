/**
 * Node - The universal container type for all data in xNet.
 *
 * A Node has only 4 universal fields. Everything else is defined by its schema.
 */

import { nanoid } from 'nanoid'

/**
 * Schema IRI - globally unique identifier for a schema.
 * Format: xnet://<authority>/<name> or xnet://<authority>/<name>@<version>
 *
 * Examples:
 * - xnet://xnet.fyi/Page (unversioned, treated as @1.0.0)
 * - xnet://xnet.fyi/Task@1.0.0 (explicit version)
 * - xnet://xnet.fyi/Task@2.0.0 (newer version)
 * - xnet://acme-corp.com/Project@1.0.0 (organization schema)
 * - xnet://did:key:z6Mk.../Recipe@1.0.0 (personal schema)
 */
export type SchemaIRI = `xnet://${string}/${string}`

// ─── Schema Version Utilities ────────────────────────────────────────────────

/**
 * Default version for schemas without explicit version.
 */
export const DEFAULT_SCHEMA_VERSION = '1.0.0'

/**
 * Parsed schema IRI components.
 */
export interface ParsedSchemaIRI {
  /** Full IRI including version */
  iri: SchemaIRI
  /** Base IRI without version (e.g., xnet://xnet.fyi/Task) */
  baseIRI: SchemaIRI
  /** Namespace (e.g., xnet://xnet.fyi/) */
  namespace: string
  /** Schema name (e.g., Task) */
  name: string
  /** Version (e.g., 1.0.0) - defaults to 1.0.0 if not present */
  version: string
  /** Whether version was explicitly specified */
  hasExplicitVersion: boolean
}

/**
 * Parse a SchemaIRI into its components.
 *
 * @example
 * parseSchemaIRI('xnet://xnet.fyi/Task@2.0.0')
 * // { baseIRI: 'xnet://xnet.fyi/Task', name: 'Task', version: '2.0.0', ... }
 *
 * parseSchemaIRI('xnet://xnet.fyi/Task')
 * // { baseIRI: 'xnet://xnet.fyi/Task', name: 'Task', version: '1.0.0', hasExplicitVersion: false }
 */
export function parseSchemaIRI(iri: SchemaIRI): ParsedSchemaIRI {
  // Match: xnet://authority/Name or xnet://authority/Name@version
  const match = iri.match(/^(xnet:\/\/[^/]+\/)([^@]+)(?:@(.+))?$/)

  if (!match) {
    // Invalid format, return with defaults
    return {
      iri,
      baseIRI: iri,
      namespace: '',
      name: iri,
      version: DEFAULT_SCHEMA_VERSION,
      hasExplicitVersion: false
    }
  }

  const [, namespace, name, version] = match
  const hasExplicitVersion = version !== undefined
  const resolvedVersion = version ?? DEFAULT_SCHEMA_VERSION
  const baseIRI = `${namespace}${name}` as SchemaIRI

  return {
    iri: hasExplicitVersion ? iri : (`${baseIRI}@${resolvedVersion}` as SchemaIRI),
    baseIRI,
    namespace,
    name,
    version: resolvedVersion,
    hasExplicitVersion
  }
}

/**
 * Build a versioned SchemaIRI from components.
 *
 * @example
 * buildSchemaIRI('xnet://xnet.fyi/', 'Task', '2.0.0')
 * // 'xnet://xnet.fyi/Task@2.0.0'
 */
export function buildSchemaIRI(namespace: string, name: string, version?: string): SchemaIRI {
  const v = version ?? DEFAULT_SCHEMA_VERSION
  return `${namespace}${name}@${v}` as SchemaIRI
}

/**
 * Normalize a SchemaIRI to always include version.
 * Unversioned IRIs get @1.0.0 appended.
 *
 * @example
 * normalizeSchemaIRI('xnet://xnet.fyi/Task')
 * // 'xnet://xnet.fyi/Task@1.0.0'
 *
 * normalizeSchemaIRI('xnet://xnet.fyi/Task@2.0.0')
 * // 'xnet://xnet.fyi/Task@2.0.0' (unchanged)
 */
export function normalizeSchemaIRI(iri: SchemaIRI): SchemaIRI {
  const parsed = parseSchemaIRI(iri)
  return parsed.iri
}

/**
 * Get the base (unversioned) IRI from a SchemaIRI.
 *
 * @example
 * getBaseSchemaIRI('xnet://xnet.fyi/Task@2.0.0')
 * // 'xnet://xnet.fyi/Task'
 */
export function getBaseSchemaIRI(iri: SchemaIRI): SchemaIRI {
  return parseSchemaIRI(iri).baseIRI
}

/**
 * Check if two SchemaIRIs refer to the same schema (ignoring version).
 */
export function isSameSchema(iri1: SchemaIRI, iri2: SchemaIRI): boolean {
  return getBaseSchemaIRI(iri1) === getBaseSchemaIRI(iri2)
}

/**
 * Get the version from a SchemaIRI.
 */
export function getSchemaVersion(iri: SchemaIRI): string {
  return parseSchemaIRI(iri).version
}

/**
 * DID - Decentralized Identifier for user identity.
 */
export type DID = `did:key:${string}`

/**
 * The minimal universal Node interface.
 *
 * Only 4 fields are universal - everything else is schema-defined:
 * - id: Unique identifier
 * - schemaId: What type of node (IRI)
 * - createdAt: When created (for sync/attribution)
 * - createdBy: Who created it (for sync/attribution)
 */
export interface Node {
  /** Unique identifier for this node */
  id: string

  /** Schema IRI defining what type this node is */
  schemaId: SchemaIRI

  /** Unix timestamp (ms) when this node was created */
  createdAt: number

  /** DID of the user who created this node */
  createdBy: DID

  /** All other fields are schema-defined */
  [key: string]: unknown
}

/**
 * Type guard to check if a value is a valid Node.
 */
export function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.schemaId === 'string' &&
    obj.schemaId.startsWith('xnet://') &&
    typeof obj.createdAt === 'number' &&
    typeof obj.createdBy === 'string' &&
    obj.createdBy.startsWith('did:key:')
  )
}

/**
 * Create a new node ID using nanoid.
 *
 * Node IDs are just unique identifiers - they don't need to be sortable
 * (sorting is done by Lamport timestamps in the Change log).
 *
 * Default length is 21 characters, providing ~126 bits of randomness.
 * URL-safe characters: A-Za-z0-9_-
 *
 * @param length - Optional length (default 21)
 * @returns A unique node ID
 */
export function createNodeId(length?: number): string {
  return nanoid(length)
}
