/**
 * Schema Utilities Tests
 *
 * Tests for database-defined schema utilities.
 */

import { describe, it, expect } from 'vitest'
import {
  buildSchemaIRI,
  parseDatabaseSchemaIRI,
  isDatabaseSchemaIRI,
  parseVersion,
  bumpSchemaVersion,
  createInitialSchemaMetadata,
  buildDatabaseSchema,
  createVersionEntry,
  pruneVersionHistory,
  getVersionBumpType,
  MAX_VERSION_HISTORY,
  type StoredColumn,
  type DatabaseSchemaMetadata
} from './schema-utils'

// ─── buildSchemaIRI ────────────────────────────────────────────────────────────

describe('buildSchemaIRI', () => {
  it('creates schema IRI from database ID and version', () => {
    const iri = buildSchemaIRI('abc123', '1.0.0')
    expect(iri).toBe('xnet://xnet.fyi/db/abc123@1.0.0')
  })

  it('handles different versions', () => {
    expect(buildSchemaIRI('db1', '1.2.3')).toBe('xnet://xnet.fyi/db/db1@1.2.3')
    expect(buildSchemaIRI('db1', '2.0.0')).toBe('xnet://xnet.fyi/db/db1@2.0.0')
  })

  it('handles complex database IDs', () => {
    const iri = buildSchemaIRI('my-database_123', '1.0.0')
    expect(iri).toBe('xnet://xnet.fyi/db/my-database_123@1.0.0')
  })
})

// ─── parseDatabaseSchemaIRI ───────────────────────────────────────────────────

describe('parseDatabaseSchemaIRI', () => {
  it('parses valid database schema IRI', () => {
    const result = parseDatabaseSchemaIRI('xnet://xnet.fyi/db/abc123@1.0.0')
    expect(result).toEqual({ databaseId: 'abc123', version: '1.0.0' })
  })

  it('handles different versions', () => {
    const result = parseDatabaseSchemaIRI('xnet://xnet.fyi/db/mydb@2.5.10')
    expect(result).toEqual({ databaseId: 'mydb', version: '2.5.10' })
  })

  it('returns null for non-database schema IRIs', () => {
    expect(parseDatabaseSchemaIRI('xnet://xnet.fyi/Task@1.0.0')).toBeNull()
    expect(parseDatabaseSchemaIRI('xnet://xnet.fyi/DynamicDatabase')).toBeNull()
  })

  it('returns null for malformed IRIs', () => {
    expect(parseDatabaseSchemaIRI('not-an-iri')).toBeNull()
    expect(parseDatabaseSchemaIRI('xnet://xnet.fyi/db/abc123')).toBeNull() // Missing version
  })
})

// ─── isDatabaseSchemaIRI ──────────────────────────────────────────────────────

describe('isDatabaseSchemaIRI', () => {
  it('returns true for database schema IRIs', () => {
    expect(isDatabaseSchemaIRI('xnet://xnet.fyi/db/abc123@1.0.0')).toBe(true)
    expect(isDatabaseSchemaIRI('xnet://xnet.fyi/db/test')).toBe(true)
  })

  it('returns false for other IRIs', () => {
    expect(isDatabaseSchemaIRI('xnet://xnet.fyi/Task@1.0.0')).toBe(false)
    expect(isDatabaseSchemaIRI('xnet://xnet.fyi/DynamicDatabase')).toBe(false)
  })
})

// ─── parseVersion ─────────────────────────────────────────────────────────────

describe('parseVersion', () => {
  it('parses valid semver versions', () => {
    expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 })
    expect(parseVersion('2.5.10')).toEqual({ major: 2, minor: 5, patch: 10 })
    expect(parseVersion('0.0.1')).toEqual({ major: 0, minor: 0, patch: 1 })
  })

  it('returns null for invalid versions', () => {
    expect(parseVersion('1.0')).toBeNull()
    expect(parseVersion('v1.0.0')).toBeNull()
    expect(parseVersion('1.0.0-beta')).toBeNull()
    expect(parseVersion('invalid')).toBeNull()
  })
})

// ─── bumpSchemaVersion ────────────────────────────────────────────────────────

describe('bumpSchemaVersion', () => {
  it('bumps patch version', () => {
    expect(bumpSchemaVersion('1.0.0', 'patch')).toBe('1.0.1')
    expect(bumpSchemaVersion('1.0.5', 'patch')).toBe('1.0.6')
    expect(bumpSchemaVersion('2.3.9', 'patch')).toBe('2.3.10')
  })

  it('bumps minor version and resets patch', () => {
    expect(bumpSchemaVersion('1.0.0', 'minor')).toBe('1.1.0')
    expect(bumpSchemaVersion('1.5.3', 'minor')).toBe('1.6.0')
    expect(bumpSchemaVersion('2.9.9', 'minor')).toBe('2.10.0')
  })

  it('handles invalid version by returning 1.0.1', () => {
    expect(bumpSchemaVersion('invalid', 'patch')).toBe('1.0.1')
  })
})

// ─── createInitialSchemaMetadata ───────────────────────────────────────────────

describe('createInitialSchemaMetadata', () => {
  it('creates metadata with version 1.0.0', () => {
    const metadata = createInitialSchemaMetadata('My Database')

    expect(metadata.name).toBe('My Database')
    expect(metadata.version).toBe('1.0.0')
    expect(metadata.createdAt).toBeGreaterThan(0)
    expect(metadata.updatedAt).toBeGreaterThan(0)
    expect(metadata.createdAt).toBe(metadata.updatedAt)
  })
})

// ─── buildDatabaseSchema ───────────────────────────────────────────────────────

describe('buildDatabaseSchema', () => {
  const metadata: DatabaseSchemaMetadata = {
    name: 'Project Tracker',
    version: '1.2.0',
    createdAt: 1707350400000,
    updatedAt: 1707436800000
  }

  const columns: StoredColumn[] = [
    { id: 'col1', name: 'Title', type: 'text' },
    { id: 'col2', name: 'Status', type: 'select', config: { options: ['Todo', 'Done'] } }
  ]

  it('builds schema with correct IRI', () => {
    const schema = buildDatabaseSchema('db123', metadata, columns)

    expect(schema['@id']).toBe('xnet://xnet.fyi/db/db123@1.2.0')
    expect(schema['@type']).toBe('xnet://xnet.fyi/Schema')
  })

  it('includes metadata in schema', () => {
    const schema = buildDatabaseSchema('db123', metadata, columns)

    expect(schema.name).toBe('Project Tracker')
    expect(schema.version).toBe('1.2.0')
    expect(schema.namespace).toBe('xnet://xnet.fyi/')
  })

  it('converts columns to property definitions', () => {
    const schema = buildDatabaseSchema('db123', metadata, columns)

    expect(schema.properties).toHaveLength(2)

    expect(schema.properties[0]).toEqual({
      '@id': 'xnet://xnet.fyi/db/db123@1.2.0#col1',
      name: 'Title',
      type: 'text',
      required: false,
      config: undefined
    })

    expect(schema.properties[1]).toEqual({
      '@id': 'xnet://xnet.fyi/db/db123@1.2.0#col2',
      name: 'Status',
      type: 'select',
      required: false,
      config: { options: ['Todo', 'Done'] }
    })
  })

  it('handles empty columns', () => {
    const schema = buildDatabaseSchema('db123', metadata, [])

    expect(schema.properties).toHaveLength(0)
  })
})

// ─── createVersionEntry ───────────────────────────────────────────────────────

describe('createVersionEntry', () => {
  const columns: StoredColumn[] = [{ id: 'col1', name: 'Title', type: 'text' }]

  it('creates entry with correct structure', () => {
    const entry = createVersionEntry('1.0.0', columns, 'initial', 'Initial schema')

    expect(entry.version).toBe('1.0.0')
    expect(entry.timestamp).toBeGreaterThan(0)
    expect(entry.columns).toEqual(columns)
    expect(entry.changeType).toBe('initial')
    expect(entry.changeDescription).toBe('Initial schema')
  })

  it('creates a copy of columns', () => {
    const entry = createVersionEntry('1.0.0', columns, 'add')

    // Modifying original shouldn't affect entry
    columns.push({ id: 'col2', name: 'New', type: 'text' })
    expect(entry.columns).toHaveLength(1)
  })
})

// ─── pruneVersionHistory ──────────────────────────────────────────────────────

describe('pruneVersionHistory', () => {
  it('returns history unchanged when under limit', () => {
    const history = [
      createVersionEntry('1.0.0', [], 'initial'),
      createVersionEntry('1.0.1', [], 'add')
    ]

    const pruned = pruneVersionHistory(history)
    expect(pruned).toHaveLength(2)
  })

  it('prunes to limit keeping most recent', () => {
    const history = Array.from({ length: MAX_VERSION_HISTORY + 10 }, (_, i) =>
      createVersionEntry(`1.0.${i}`, [], 'add')
    )

    const pruned = pruneVersionHistory(history)
    expect(pruned).toHaveLength(MAX_VERSION_HISTORY)
    // Should keep the last entries
    expect(pruned[0].version).toBe('1.0.10')
    expect(pruned[pruned.length - 1].version).toBe(`1.0.${MAX_VERSION_HISTORY + 9}`)
  })
})

// ─── getVersionBumpType ───────────────────────────────────────────────────────

describe('getVersionBumpType', () => {
  it('returns patch for non-breaking changes', () => {
    expect(getVersionBumpType('add')).toBe('patch')
    expect(getVersionBumpType('update')).toBe('patch')
    expect(getVersionBumpType('rename')).toBe('patch')
  })

  it('returns minor for breaking changes', () => {
    expect(getVersionBumpType('delete')).toBe('minor')
    expect(getVersionBumpType('changeType')).toBe('minor')
  })
})
