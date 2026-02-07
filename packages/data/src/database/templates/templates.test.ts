/**
 * Tests for database templates.
 */

import type { DatabaseForTemplate } from './types'
import { describe, it, expect } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  getTemplatesByCategory,
  searchTemplates,
  getTemplateById,
  getTemplateCategoryCounts
} from './builtin'
import { instantiateTemplate, createEmptyTemplate, createEmptyDatabase } from './instantiate'
import {
  createTemplateFromDatabase,
  sanitizeValueForTemplate,
  validateTemplate
} from './save-template'

// ─── Built-in Templates Tests ─────────────────────────────────────────────────

describe('Built-in Templates', () => {
  describe('BUILTIN_TEMPLATES', () => {
    it('has 8 built-in templates', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(8)
    })

    it('all templates have required fields', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.id).toBeTruthy()
        expect(template.name).toBeTruthy()
        expect(template.description).toBeTruthy()
        expect(template.icon).toBeTruthy()
        expect(template.category).toBeTruthy()
        expect(template.columns.length).toBeGreaterThan(0)
        expect(template.views.length).toBeGreaterThan(0)
        expect(template.metadata.version).toBeTruthy()
        expect(template.metadata.createdAt).toBeTruthy()
      }
    })

    it('all templates have at least one title column', () => {
      for (const template of BUILTIN_TEMPLATES) {
        const hasTitleColumn = template.columns.some((c) => c.isTitle)
        expect(hasTitleColumn).toBe(true)
      }
    })
  })

  describe('getTemplatesByCategory', () => {
    it('returns project management templates', () => {
      const templates = getTemplatesByCategory('project-management')
      expect(templates.length).toBeGreaterThan(0)
      expect(templates.every((t) => t.category === 'project-management')).toBe(true)
    })

    it('returns empty array for category with no templates', () => {
      const templates = getTemplatesByCategory('custom')
      expect(templates).toEqual([])
    })
  })

  describe('searchTemplates', () => {
    it('finds templates by name', () => {
      const results = searchTemplates('project')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.name.toLowerCase().includes('project'))).toBe(true)
    })

    it('finds templates by description', () => {
      const results = searchTemplates('track')
      expect(results.length).toBeGreaterThan(0)
    })

    it('finds templates by tags', () => {
      const results = searchTemplates('kanban')
      expect(results.length).toBeGreaterThan(0)
    })

    it('returns empty array for no matches', () => {
      const results = searchTemplates('xyznonexistent')
      expect(results).toEqual([])
    })
  })

  describe('getTemplateById', () => {
    it('finds template by id', () => {
      const template = getTemplateById('project-tracker')
      expect(template).toBeDefined()
      expect(template?.name).toBe('Project Tracker')
    })

    it('returns undefined for unknown id', () => {
      const template = getTemplateById('nonexistent')
      expect(template).toBeUndefined()
    })
  })

  describe('getTemplateCategoryCounts', () => {
    it('returns counts for all categories', () => {
      const counts = getTemplateCategoryCounts()
      expect(counts['project-management']).toBe(2)
      expect(counts['crm']).toBe(1)
      expect(counts['inventory']).toBe(1)
      expect(counts['content']).toBe(1)
      expect(counts['personal']).toBe(1)
      expect(counts['education']).toBe(1)
      expect(counts['finance']).toBe(1)
      expect(counts['custom']).toBe(0)
    })
  })
})

// ─── Template Instantiation Tests ─────────────────────────────────────────────

describe('Template Instantiation', () => {
  describe('instantiateTemplate', () => {
    it('creates database from template', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template)

      expect(db.id).toBeTruthy()
      expect(db.name).toBe(template.name)
      expect(db.columns).toHaveLength(template.columns.length)
      expect(db.views).toHaveLength(template.views.length)
    })

    it('remaps column IDs', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template)

      // IDs should be different from template IDs
      expect(db.columns[0].id).not.toBe(template.columns[0].id)

      // Column ID map should have all columns
      expect(db.columnIdMap.size).toBe(template.columns.length)
    })

    it('remaps view IDs', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template)

      expect(db.views[0].id).not.toBe(template.views[0].id)
      expect(db.viewIdMap.size).toBe(template.views.length)
    })

    it('remaps column references in views', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template)

      const columnIds = new Set(db.columns.map((c) => c.id))

      for (const view of db.views) {
        for (const visibleCol of view.visibleColumns) {
          expect(columnIds.has(visibleCol)).toBe(true)
        }
      }
    })

    it('includes sample data when requested', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template, { includeSampleData: true })

      expect(db.rows.length).toBe(template.sampleData?.length ?? 0)
    })

    it('excludes sample data when not requested', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template, { includeSampleData: false })

      expect(db.rows).toHaveLength(0)
    })

    it('uses custom name when provided', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template, { name: 'My Custom Database' })

      expect(db.name).toBe('My Custom Database')
    })

    it('remaps cell values to new column IDs', () => {
      const template = BUILTIN_TEMPLATES[0]
      const db = instantiateTemplate(template, { includeSampleData: true })

      if (db.rows.length > 0) {
        const row = db.rows[0]
        const cellColumnIds = Object.keys(row.cells)
        const dbColumnIds = new Set(db.columns.map((c) => c.id))

        for (const cellColId of cellColumnIds) {
          expect(dbColumnIds.has(cellColId)).toBe(true)
        }
      }
    })
  })

  describe('createEmptyTemplate', () => {
    it('creates a minimal template', () => {
      const template = createEmptyTemplate()

      expect(template.id).toBe('empty')
      expect(template.name).toBe('Untitled Database')
      expect(template.columns).toHaveLength(1)
      expect(template.columns[0].isTitle).toBe(true)
      expect(template.views).toHaveLength(1)
    })
  })

  describe('createEmptyDatabase', () => {
    it('creates an empty database', () => {
      const db = createEmptyDatabase()

      expect(db.id).toBeTruthy()
      expect(db.name).toBe('Untitled Database')
      expect(db.columns).toHaveLength(1)
      expect(db.views).toHaveLength(1)
      expect(db.rows).toHaveLength(0)
    })

    it('uses custom name', () => {
      const db = createEmptyDatabase('My Database')

      expect(db.name).toBe('My Database')
    })
  })
})

// ─── Save Template Tests ──────────────────────────────────────────────────────

describe('Save Template', () => {
  const mockDatabase: DatabaseForTemplate = {
    name: 'My Database',
    columns: [
      { id: 'col-abc', name: 'Title', type: 'text', config: {}, isTitle: true },
      {
        id: 'col-def',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'opt-1', name: 'Active', color: 'green' },
            { id: 'opt-2', name: 'Inactive', color: 'gray' }
          ]
        }
      },
      { id: 'col-ghi', name: 'Count', type: 'number', config: {} }
    ],
    views: [
      {
        id: 'view-123',
        name: 'All',
        type: 'table',
        visibleColumns: ['col-abc', 'col-def', 'col-ghi']
      },
      {
        id: 'view-456',
        name: 'By Status',
        type: 'board',
        visibleColumns: ['col-abc', 'col-ghi'],
        groupBy: 'col-def'
      }
    ],
    rows: [
      {
        id: 'row-1',
        sortKey: 'a0',
        cells: { 'col-abc': 'Item 1', 'col-def': 'opt-1', 'col-ghi': 10 }
      },
      {
        id: 'row-2',
        sortKey: 'a1',
        cells: { 'col-abc': 'Item 2', 'col-def': 'opt-2', 'col-ghi': 20 }
      }
    ]
  }

  describe('createTemplateFromDatabase', () => {
    it('creates template from database', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test template'
      })

      expect(template.id).toBeTruthy()
      expect(template.name).toBe('My Template')
      expect(template.description).toBe('Test template')
      expect(template.columns).toHaveLength(3)
      expect(template.views).toHaveLength(2)
    })

    it('uses stable placeholder IDs for columns', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })

      expect(template.columns[0].id).toBe('col-0')
      expect(template.columns[1].id).toBe('col-1')
      expect(template.columns[2].id).toBe('col-2')
    })

    it('uses stable placeholder IDs for views', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })

      expect(template.views[0].id).toBe('view-0')
      expect(template.views[1].id).toBe('view-1')
    })

    it('remaps column references in views', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })

      expect(template.views[0].visibleColumns).toEqual(['col-0', 'col-1', 'col-2'])
      expect(template.views[1].groupBy).toBe('col-1')
    })

    it('includes sample data when requested', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test',
        includeSampleData: true
      })

      expect(template.sampleData).toHaveLength(2)
    })

    it('excludes sample data by default', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })

      expect(template.sampleData).toBeUndefined()
    })

    it('respects maxSampleRows', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test',
        includeSampleData: true,
        maxSampleRows: 1
      })

      expect(template.sampleData).toHaveLength(1)
    })

    it('sets metadata correctly', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test',
        tags: ['test', 'example'],
        authorDid: 'did:key:abc123'
      })

      expect(template.metadata.version).toBe('1.0.0')
      expect(template.metadata.tags).toEqual(['test', 'example'])
      expect(template.metadata.author).toBe('did:key:abc123')
      expect(template.metadata.createdAt).toBeTruthy()
    })
  })

  describe('sanitizeValueForTemplate', () => {
    it('sanitizes email addresses', () => {
      expect(sanitizeValueForTemplate('user@example.com')).toBe('example@example.com')
    })

    it('sanitizes phone numbers', () => {
      expect(sanitizeValueForTemplate('+1 555-123-4567')).toBe('+1 555-0123')
      expect(sanitizeValueForTemplate('5551234567')).toBe('+1 555-0123')
    })

    it('preserves non-sensitive values', () => {
      expect(sanitizeValueForTemplate('Hello World')).toBe('Hello World')
      expect(sanitizeValueForTemplate(42)).toBe(42)
      expect(sanitizeValueForTemplate(true)).toBe(true)
    })

    it('handles null and undefined', () => {
      expect(sanitizeValueForTemplate(null)).toBe(null)
      expect(sanitizeValueForTemplate(undefined)).toBe(undefined)
    })

    it('sanitizes values in arrays', () => {
      const result = sanitizeValueForTemplate(['user@example.com', 'hello'])
      expect(result).toEqual(['example@example.com', 'hello'])
    })

    it('sanitizes values in objects', () => {
      const result = sanitizeValueForTemplate({ email: 'user@example.com', name: 'John' })
      expect(result).toEqual({ email: 'example@example.com', name: 'John' })
    })
  })

  describe('validateTemplate', () => {
    it('validates a valid template', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })

      const result = validateTemplate(template)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('validates built-in templates', () => {
      for (const template of BUILTIN_TEMPLATES) {
        const result = validateTemplate(template)
        expect(result.valid).toBe(true)
      }
    })

    it('detects missing id', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })
      template.id = ''

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Template must have an id')
    })

    it('detects missing name', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })
      template.name = ''

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Template must have a name')
    })

    it('detects empty columns', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })
      template.columns = []

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Template must have at least one column')
    })

    it('detects duplicate column ids', () => {
      const template = createTemplateFromDatabase(mockDatabase, {
        name: 'My Template',
        description: 'Test'
      })
      template.columns[1].id = template.columns[0].id

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Duplicate column id'))).toBe(true)
    })
  })
})

// ─── Round-trip Tests ─────────────────────────────────────────────────────────

describe('Template Round-trip', () => {
  it('can save and instantiate a database', () => {
    const originalDb: DatabaseForTemplate = {
      name: 'Original',
      columns: [
        { id: 'col-1', name: 'Name', type: 'text', config: {}, isTitle: true },
        { id: 'col-2', name: 'Active', type: 'checkbox', config: {} }
      ],
      views: [
        {
          id: 'view-1',
          name: 'All',
          type: 'table',
          visibleColumns: ['col-1', 'col-2']
        }
      ],
      rows: [{ id: 'row-1', sortKey: 'a0', cells: { 'col-1': 'Item 1', 'col-2': true } }]
    }

    // Save as template
    const template = createTemplateFromDatabase(originalDb, {
      name: 'Test Template',
      description: 'Test',
      includeSampleData: true
    })

    // Instantiate from template
    const newDb = instantiateTemplate(template, { includeSampleData: true })

    // Verify structure is preserved
    expect(newDb.columns).toHaveLength(originalDb.columns.length)
    expect(newDb.views).toHaveLength(originalDb.views.length)
    expect(newDb.rows).toHaveLength(originalDb.rows.length)

    // Verify column names and types
    expect(newDb.columns[0].name).toBe('Name')
    expect(newDb.columns[0].type).toBe('text')
    expect(newDb.columns[0].isTitle).toBe(true)
    expect(newDb.columns[1].name).toBe('Active')
    expect(newDb.columns[1].type).toBe('checkbox')

    // Verify view structure
    expect(newDb.views[0].name).toBe('All')
    expect(newDb.views[0].type).toBe('table')
    expect(newDb.views[0].visibleColumns).toHaveLength(2)
  })
})
