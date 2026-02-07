/**
 * Database Schema Utilities
 *
 * Utilities for generating unique, versioned schema IRIs for databases
 * and managing schema metadata stored in Y.Doc.
 */

import type { SchemaIRI } from '../schema/node'
import type { PropertyDefinition, Schema, PropertyType } from '../schema/types'

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Schema metadata stored in a database's Y.Doc.
 */
export interface DatabaseSchemaMetadata {
  /** User-editable schema name */
  name: string
  /** Optional description */
  description?: string
  /** Semver version (auto-incremented) */
  version: string
  /** When the database was created */
  createdAt: number
  /** Last column modification time */
  updatedAt: number
}

/**
 * A stored column in a database's Y.Doc.
 */
export interface StoredColumn {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
}

/**
 * Schema version history entry.
 */
export interface SchemaVersionEntry {
  version: string
  timestamp: number
  columns: StoredColumn[]
  changeType: 'initial' | 'add' | 'update' | 'delete'
  changeDescription?: string
}

/**
 * Type of version bump.
 */
export type VersionBumpType = 'patch' | 'minor'

// ─── Constants ──────────────────────────────────────────────────────────────────

/**
 * Default namespace for database-defined schemas.
 */
export const DATABASE_SCHEMA_NAMESPACE = 'xnet://xnet.fyi/'

/**
 * Prefix for database schema IRIs.
 */
export const DATABASE_SCHEMA_PREFIX = 'xnet://xnet.fyi/db/'

// ─── Schema IRI Generation ─────────────────────────────────────────────────────

/**
 * Generate a schema IRI from a database ID and version.
 *
 * @example
 * buildSchemaIRI('abc123', '1.0.0') // => 'xnet://xnet.fyi/db/abc123@1.0.0'
 */
export function buildSchemaIRI(databaseId: string, version: string): SchemaIRI {
  return `${DATABASE_SCHEMA_PREFIX}${databaseId}@${version}` as SchemaIRI
}

/**
 * Parse a database schema IRI to extract the database ID and version.
 *
 * @returns { databaseId, version } or null if the IRI doesn't match the pattern
 *
 * @example
 * parseSchemaIRI('xnet://xnet.fyi/db/abc123@1.0.0')
 * // => { databaseId: 'abc123', version: '1.0.0' }
 */
export function parseDatabaseSchemaIRI(
  iri: string
): { databaseId: string; version: string } | null {
  const match = iri.match(/^xnet:\/\/xnet\.fyi\/db\/([^@]+)@(.+)$/)
  if (!match) return null
  return { databaseId: match[1], version: match[2] }
}

/**
 * Check if an IRI is a database-defined schema IRI.
 */
export function isDatabaseSchemaIRI(iri: string): boolean {
  return iri.startsWith(DATABASE_SCHEMA_PREFIX)
}

// ─── Version Utilities ─────────────────────────────────────────────────────────

/**
 * Parse a semver version string.
 *
 * @returns { major, minor, patch } or null if invalid
 */
export function parseVersion(
  version: string
): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  }
}

/**
 * Bump a schema version.
 *
 * - patch: 1.0.0 -> 1.0.1 (add column, update column, rename)
 * - minor: 1.0.0 -> 1.1.0 (delete column, change column type)
 *
 * @example
 * bumpSchemaVersion('1.0.0', 'patch') // => '1.0.1'
 * bumpSchemaVersion('1.0.5', 'minor') // => '1.1.0'
 */
export function bumpSchemaVersion(current: string, type: VersionBumpType): string {
  const parsed = parseVersion(current)
  if (!parsed) {
    // If we can't parse, start fresh
    return '1.0.1'
  }

  if (type === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`
  } else {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
  }
}

/**
 * Create initial schema metadata for a new database.
 */
export function createInitialSchemaMetadata(name: string): DatabaseSchemaMetadata {
  const now = Date.now()
  return {
    name,
    version: '1.0.0',
    createdAt: now,
    updatedAt: now
  }
}

// ─── Schema Building ────────────────────────────────────────────────────────────

/**
 * Build a Schema object from database metadata and columns.
 *
 * This creates a unique, versioned schema for the database.
 *
 * @example
 * const schema = buildDatabaseSchema('db123', metadata, columns)
 * // schema['@id'] === 'xnet://xnet.fyi/db/db123@1.0.0'
 */
export function buildDatabaseSchema(
  databaseId: string,
  metadata: DatabaseSchemaMetadata,
  columns: StoredColumn[]
): Schema {
  const schemaIRI = buildSchemaIRI(databaseId, metadata.version)

  const properties: PropertyDefinition[] = columns.map((col) => ({
    '@id': `${schemaIRI}#${col.id}`,
    name: col.name,
    type: col.type,
    required: false,
    config: col.config
  }))

  return {
    '@id': schemaIRI,
    '@type': 'xnet://xnet.fyi/Schema',
    name: metadata.name,
    namespace: DATABASE_SCHEMA_NAMESPACE,
    version: metadata.version,
    properties
  }
}

// ─── Version History ────────────────────────────────────────────────────────────

/**
 * Create a schema version history entry.
 */
export function createVersionEntry(
  version: string,
  columns: StoredColumn[],
  changeType: SchemaVersionEntry['changeType'],
  changeDescription?: string
): SchemaVersionEntry {
  return {
    version,
    timestamp: Date.now(),
    columns: [...columns],
    changeType,
    changeDescription
  }
}

/**
 * Maximum number of version history entries to keep.
 */
export const MAX_VERSION_HISTORY = 50

/**
 * Prune version history to stay within limits.
 */
export function pruneVersionHistory(history: SchemaVersionEntry[]): SchemaVersionEntry[] {
  if (history.length <= MAX_VERSION_HISTORY) {
    return history
  }
  // Keep most recent entries
  return history.slice(-MAX_VERSION_HISTORY)
}

// ─── Change Detection ──────────────────────────────────────────────────────────

/**
 * Determine the version bump type for a column operation.
 */
export function getVersionBumpType(
  operation: 'add' | 'update' | 'rename' | 'delete' | 'changeType'
): VersionBumpType {
  // Breaking changes require minor bump
  if (operation === 'delete' || operation === 'changeType') {
    return 'minor'
  }
  // Non-breaking changes use patch
  return 'patch'
}
