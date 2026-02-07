/**
 * Tests for import/export functionality.
 */

import type { ColumnDefinition } from '../column-types'
import { describe, it, expect } from 'vitest'
import { exportToCsv, escapeCSV, formatValue } from '../export/csv-export'
import { exportToJson, exportToJsonArray, exportToNdjson } from '../export/json-export'
import { parseCSV, parseCSVLine, guessColumnType, parseValue, inferColumnTypes } from './csv-parser'
import {
  parseJSON,
  inferColumnsFromRows,
  inferTypeFromValues,
  validateJsonData
} from './json-parser'

// ─── CSV Parser Tests ─────────────────────────────────────────────────────────

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    it('parses simple CSV', () => {
      const csv = `name,age,active
Alice,30,true
Bob,25,false`

      const result = parseCSV(csv)

      expect(result.headers).toEqual(['name', 'age', 'active'])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toEqual(['Alice', '30', 'true'])
      expect(result.rows[1]).toEqual(['Bob', '25', 'false'])
    })

    it('handles quoted values with commas', () => {
      const csv = `name,description
"John Doe","Hello, World"`

      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['John Doe', 'Hello, World'])
    })

    it('handles escaped quotes', () => {
      const csv = `name,quote
Alice,"She said ""hello"""`

      const result = parseCSV(csv)

      expect(result.rows[0][1]).toBe('She said "hello"')
    })

    it('handles empty CSV', () => {
      const result = parseCSV('')

      expect(result.headers).toEqual([])
      expect(result.rows).toEqual([])
    })

    it('handles CSV with only headers', () => {
      const csv = 'name,age,active'

      const result = parseCSV(csv)

      expect(result.headers).toEqual(['name', 'age', 'active'])
      expect(result.rows).toEqual([])
    })

    it('handles Windows line endings', () => {
      const csv = 'name,age\r\nAlice,30\r\nBob,25'

      const result = parseCSV(csv)

      expect(result.rows).toHaveLength(2)
    })

    it('skips empty lines', () => {
      const csv = `name,age

Alice,30

Bob,25
`

      const result = parseCSV(csv)

      expect(result.rows).toHaveLength(2)
    })

    it('handles CSV without headers', () => {
      const csv = `Alice,30
Bob,25`

      const result = parseCSV(csv, { hasHeaders: false })

      expect(result.headers).toEqual(['Column 1', 'Column 2'])
      expect(result.rows).toHaveLength(2)
    })

    it('handles custom delimiter', () => {
      const csv = `name;age
Alice;30`

      const result = parseCSV(csv, { delimiter: ';' })

      expect(result.headers).toEqual(['name', 'age'])
      expect(result.rows[0]).toEqual(['Alice', '30'])
    })
  })

  describe('parseCSVLine', () => {
    it('parses simple line', () => {
      expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    it('handles quoted values', () => {
      expect(parseCSVLine('"hello, world",test')).toEqual(['hello, world', 'test'])
    })

    it('handles escaped quotes', () => {
      expect(parseCSVLine('"say ""hi"""')).toEqual(['say "hi"'])
    })

    it('trims whitespace', () => {
      expect(parseCSVLine('  a  ,  b  ')).toEqual(['a', 'b'])
    })
  })

  describe('guessColumnType', () => {
    it('detects numbers', () => {
      expect(guessColumnType(['1', '2.5', '100', '-50'])).toBe('number')
    })

    it('detects booleans', () => {
      expect(guessColumnType(['true', 'false', 'yes', 'no'])).toBe('checkbox')
    })

    it('detects dates', () => {
      expect(guessColumnType(['2024-01-01', '2024-06-15', '2023-12-31'])).toBe('date')
    })

    it('detects emails', () => {
      expect(guessColumnType(['a@b.com', 'test@example.org'])).toBe('email')
    })

    it('detects URLs', () => {
      expect(guessColumnType(['https://example.com', 'http://test.org'])).toBe('url')
    })

    it('detects phone numbers', () => {
      expect(guessColumnType(['+1 555-1234', '(555) 123-4567'])).toBe('phone')
    })

    it('defaults to text', () => {
      expect(guessColumnType(['hello', 'world'])).toBe('text')
    })

    it('handles empty values', () => {
      expect(guessColumnType(['', '', ''])).toBe('text')
    })

    it('ignores empty values when inferring', () => {
      expect(guessColumnType(['1', '', '2', ''])).toBe('number')
    })
  })

  describe('parseValue', () => {
    it('parses numbers', () => {
      expect(parseValue('42', 'number')).toBe(42)
      expect(parseValue('3.14', 'number')).toBe(3.14)
      expect(parseValue('-10', 'number')).toBe(-10)
    })

    it('parses checkboxes', () => {
      expect(parseValue('true', 'checkbox')).toBe(true)
      expect(parseValue('yes', 'checkbox')).toBe(true)
      expect(parseValue('1', 'checkbox')).toBe(true)
      expect(parseValue('false', 'checkbox')).toBe(false)
      expect(parseValue('no', 'checkbox')).toBe(false)
    })

    it('parses dates', () => {
      const result = parseValue('2024-01-15', 'date')
      expect(result).toContain('2024-01-15')
    })

    it('parses multiSelect', () => {
      expect(parseValue('a, b, c', 'multiSelect')).toEqual(['a', 'b', 'c'])
    })

    it('returns null for empty values', () => {
      expect(parseValue('', 'text')).toBe(null)
      expect(parseValue('  ', 'number')).toBe(null)
    })

    it('returns null for invalid numbers', () => {
      expect(parseValue('not a number', 'number')).toBe(null)
    })
  })

  describe('inferColumnTypes', () => {
    it('infers types from rows', () => {
      const headers = ['name', 'age', 'active']
      const rows = [
        ['Alice', '30', 'true'],
        ['Bob', '25', 'false']
      ]

      const types = inferColumnTypes(headers, rows)

      expect(types.get('name')).toBe('text')
      expect(types.get('age')).toBe('number')
      expect(types.get('active')).toBe('checkbox')
    })
  })
})

// ─── JSON Parser Tests ────────────────────────────────────────────────────────

describe('JSON Parser', () => {
  describe('parseJSON', () => {
    it('parses array of objects', () => {
      const json = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ])

      const result = parseJSON(json)

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 })
      expect(result.inferredColumns).toHaveLength(2)
    })

    it('parses object with rows property', () => {
      const json = JSON.stringify({
        rows: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]
      })

      const result = parseJSON(json)

      expect(result.rows).toHaveLength(2)
    })

    it('uses provided columns if available', () => {
      const json = JSON.stringify({
        columns: [
          { id: 'col1', name: 'Name', type: 'text', config: {} },
          { id: 'col2', name: 'Age', type: 'number', config: {} }
        ],
        rows: [{ name: 'Alice', age: 30 }]
      })

      const result = parseJSON(json)

      expect(result.inferredColumns[0].name).toBe('Name')
      expect(result.inferredColumns[0].type).toBe('text')
    })

    it('throws on invalid JSON', () => {
      expect(() => parseJSON('not json')).toThrow('Invalid JSON')
    })

    it('throws on invalid format', () => {
      expect(() => parseJSON('"just a string"')).toThrow('Invalid JSON format')
    })

    it('respects maxRows option', () => {
      const json = JSON.stringify([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }])

      const result = parseJSON(json, { maxRows: 2 })

      expect(result.rows).toHaveLength(2)
    })
  })

  describe('inferColumnsFromRows', () => {
    it('infers columns from rows', () => {
      const rows = [
        { name: 'Alice', age: 30, active: true },
        { name: 'Bob', age: 25, active: false }
      ]

      const columns = inferColumnsFromRows(rows)

      expect(columns).toHaveLength(3)
      expect(columns.find((c) => c.name === 'name')?.type).toBe('text')
      expect(columns.find((c) => c.name === 'age')?.type).toBe('number')
      expect(columns.find((c) => c.name === 'active')?.type).toBe('checkbox')
    })

    it('includes sample values', () => {
      const rows = [{ name: 'Alice' }, { name: 'Bob' }]

      const columns = inferColumnsFromRows(rows)

      expect(columns[0].sampleValues).toEqual(['Alice', 'Bob'])
    })
  })

  describe('inferTypeFromValues', () => {
    it('infers boolean', () => {
      expect(inferTypeFromValues([true, false, true])).toBe('checkbox')
    })

    it('infers number', () => {
      expect(inferTypeFromValues([1, 2, 3.5])).toBe('number')
    })

    it('infers array as multiSelect', () => {
      expect(inferTypeFromValues([['a', 'b'], ['c']])).toBe('multiSelect')
    })

    it('infers date strings', () => {
      expect(inferTypeFromValues(['2024-01-01', '2024-06-15'])).toBe('date')
    })

    it('defaults to text', () => {
      expect(inferTypeFromValues(['hello', 'world'])).toBe('text')
    })
  })

  describe('validateJsonData', () => {
    it('validates array of objects', () => {
      const result = validateJsonData([{ name: 'Alice' }])
      expect(result.valid).toBe(true)
    })

    it('validates object with rows', () => {
      const result = validateJsonData({ rows: [{ name: 'Alice' }] })
      expect(result.valid).toBe(true)
    })

    it('rejects null', () => {
      const result = validateJsonData(null)
      expect(result.valid).toBe(false)
    })

    it('rejects object without rows', () => {
      const result = validateJsonData({ data: [] })
      expect(result.valid).toBe(false)
    })
  })
})

// ─── CSV Export Tests ─────────────────────────────────────────────────────────

describe('CSV Export', () => {
  const columns: ColumnDefinition[] = [
    { id: 'name', name: 'Name', type: 'text', config: {} },
    { id: 'age', name: 'Age', type: 'number', config: {} },
    { id: 'active', name: 'Active', type: 'checkbox', config: {} }
  ]

  const rows = [
    { id: '1', sortKey: 'a0', cells: { name: 'Alice', age: 30, active: true } },
    { id: '2', sortKey: 'a1', cells: { name: 'Bob', age: 25, active: false } }
  ]

  describe('exportToCsv', () => {
    it('exports rows with headers', () => {
      const csv = exportToCsv(rows, columns)

      expect(csv).toBe('Name,Age,Active\r\nAlice,30,true\r\nBob,25,false')
    })

    it('exports without headers', () => {
      const csv = exportToCsv(rows, columns, { includeHeaders: false })

      expect(csv).toBe('Alice,30,true\r\nBob,25,false')
    })

    it('exports selected columns', () => {
      const csv = exportToCsv(rows, columns, { columns: ['name', 'age'] })

      expect(csv).toBe('Name,Age\r\nAlice,30\r\nBob,25')
    })

    it('uses custom delimiter', () => {
      const csv = exportToCsv(rows, columns, { delimiter: ';' })

      expect(csv).toContain('Name;Age;Active')
    })

    it('uses custom line ending', () => {
      const csv = exportToCsv(rows, columns, { lineEnding: '\n' })

      expect(csv).toBe('Name,Age,Active\nAlice,30,true\nBob,25,false')
    })
  })

  describe('escapeCSV', () => {
    it('escapes values with commas', () => {
      expect(escapeCSV('hello, world')).toBe('"hello, world"')
    })

    it('escapes values with quotes', () => {
      expect(escapeCSV('say "hi"')).toBe('"say ""hi"""')
    })

    it('escapes values with newlines', () => {
      expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"')
    })

    it('does not escape simple values', () => {
      expect(escapeCSV('hello')).toBe('hello')
    })
  })

  describe('formatValue', () => {
    it('formats null as empty string', () => {
      expect(formatValue(null, columns[0])).toBe('')
    })

    it('formats checkbox', () => {
      expect(formatValue(true, columns[2])).toBe('true')
      expect(formatValue(false, columns[2])).toBe('false')
    })

    it('formats date', () => {
      const dateCol: ColumnDefinition = { id: 'd', name: 'Date', type: 'date', config: {} }
      const result = formatValue('2024-01-15T00:00:00.000Z', dateCol)
      expect(result).toBe('2024-01-15')
    })

    it('formats multiSelect', () => {
      const msCol: ColumnDefinition = { id: 'ms', name: 'Tags', type: 'multiSelect', config: {} }
      expect(formatValue(['a', 'b', 'c'], msCol)).toBe('a, b, c')
    })

    it('formats select with option name', () => {
      const selectCol: ColumnDefinition = {
        id: 's',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'active', name: 'Active', color: 'green' },
            { id: 'inactive', name: 'Inactive', color: 'gray' }
          ]
        }
      }
      expect(formatValue('active', selectCol)).toBe('Active')
    })
  })
})

// ─── JSON Export Tests ────────────────────────────────────────────────────────

describe('JSON Export', () => {
  const columns: ColumnDefinition[] = [
    { id: 'name', name: 'Name', type: 'text', config: {} },
    { id: 'age', name: 'Age', type: 'number', config: {} }
  ]

  const rows = [
    { id: '1', sortKey: 'a0', cells: { name: 'Alice', age: 30 } },
    { id: '2', sortKey: 'a1', cells: { name: 'Bob', age: 25 } }
  ]

  describe('exportToJson', () => {
    it('exports with schema', () => {
      const json = JSON.parse(exportToJson(rows, columns))

      expect(json.rows).toHaveLength(2)
      expect(json.rows[0].Name).toBe('Alice')
      expect(json.columns).toHaveLength(2)
      expect(json.columns[0].name).toBe('Name')
      expect(json.metadata.rowCount).toBe(2)
    })

    it('exports without schema', () => {
      const json = JSON.parse(exportToJson(rows, columns, { includeSchema: false }))

      expect(json.rows).toHaveLength(2)
      expect(json.columns).toBeUndefined()
    })

    it('exports with column IDs', () => {
      const json = JSON.parse(exportToJson(rows, columns, { useColumnNames: false }))

      expect(json.rows[0].name).toBe('Alice')
      expect(json.rows[0].Name).toBeUndefined()
    })

    it('exports with row IDs', () => {
      const json = JSON.parse(exportToJson(rows, columns, { includeIds: true }))

      expect(json.rows[0]._id).toBe('1')
    })

    it('exports selected columns', () => {
      const json = JSON.parse(exportToJson(rows, columns, { columns: ['name'] }))

      expect(json.rows[0].Name).toBe('Alice')
      expect(json.rows[0].Age).toBeUndefined()
    })

    it('exports without pretty printing', () => {
      const json = exportToJson(rows, columns, { pretty: false })

      expect(json).not.toContain('\n')
    })
  })

  describe('exportToJsonArray', () => {
    it('exports as simple array', () => {
      const json = JSON.parse(exportToJsonArray(rows, columns))

      expect(Array.isArray(json)).toBe(true)
      expect(json).toHaveLength(2)
      expect(json[0].Name).toBe('Alice')
    })
  })

  describe('exportToNdjson', () => {
    it('exports as newline-delimited JSON', () => {
      const ndjson = exportToNdjson(rows, columns)
      const lines = ndjson.split('\n')

      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).Name).toBe('Alice')
      expect(JSON.parse(lines[1]).Name).toBe('Bob')
    })
  })
})
