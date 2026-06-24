import type { FieldType, NodeState, Schema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_FIELD,
  buildGridFields,
  buildSchemaOptions,
  coerceCellValue,
  coerceCellValueForType,
  formatPlanRows,
  gridFieldsToColumnDefinitions,
  nodeToGridRow,
  observedPropertyKeys,
  propertyTypeToFieldType,
  schemaLabel
} from './grid-adapter'

function makeSchema(): Schema {
  return {
    '@id': 'xnet://xnet.fyi/Task@1.0.0',
    '@type': 'xnet://xnet.fyi/Schema',
    name: 'Task',
    namespace: 'xnet://xnet.fyi/',
    version: '1.0.0',
    properties: [
      { '@id': 'xnet://xnet.fyi/Task#title', name: 'title', type: 'text', required: true },
      { '@id': 'xnet://xnet.fyi/Task#count', name: 'count', type: 'number', required: false },
      { '@id': 'xnet://xnet.fyi/Task#meta', name: 'meta', type: 'json', required: false },
      { '@id': 'xnet://xnet.fyi/Task#status', name: 'status', type: 'select', required: false },
      {
        '@id': 'xnet://xnet.fyi/Task#updatedAt',
        name: 'updatedAt',
        type: 'updated',
        required: false
      }
    ]
  } as Schema
}

function makeNode(props: Record<string, unknown>): NodeState {
  return {
    id: 'node-1',
    schemaId: 'xnet://xnet.fyi/Task@1.0.0',
    properties: props,
    timestamps: {},
    deleted: false,
    createdAt: 1_700_000_000_000,
    createdBy: 'did:key:zABCDEFGHIJKLMNOP',
    updatedAt: 1_700_000_500_000,
    updatedBy: 'did:key:zABCDEFGHIJKLMNOP'
  } as NodeState
}

describe('schemaLabel', () => {
  it('strips namespace and version', () => {
    expect(schemaLabel('xnet://xnet.fyi/Task@1.0.0')).toBe('Task')
  })
})

describe('buildSchemaOptions', () => {
  it('collapses a versioned IRI and its bare alias into one option (the duplicate-schema bug)', () => {
    const opts = buildSchemaOptions([
      'xnet://xnet.fyi/Task@1.0.0',
      'xnet://xnet.fyi/Task',
      'xnet://xnet.fyi/Account',
      'xnet://xnet.fyi/Account@1.0.0'
    ])
    expect(opts.map((o) => o.label)).toEqual(['Account', 'Task'])
    // queries the versioned IRI (nodes store versioned schemaIds)
    expect(opts.find((o) => o.label === 'Task')?.iri).toBe('xnet://xnet.fyi/Task@1.0.0')
  })

  it('keeps genuinely-distinct versions, disambiguated by a version suffix', () => {
    const opts = buildSchemaOptions(['xnet://xnet.fyi/Task@1.0.0', 'xnet://xnet.fyi/Task@2.0.0'])
    expect(opts.map((o) => o.label).sort()).toEqual(['Task @1.0.0', 'Task @2.0.0'])
  })

  it('handles a bare-only IRI and dedupes repeats', () => {
    const opts = buildSchemaOptions([
      'xnet://xnet.fyi/Note',
      'xnet://xnet.fyi/Note',
      'xnet://xnet.fyi/Zeta@1.0.0'
    ])
    expect(opts.map((o) => o.label)).toEqual(['Note', 'Zeta'])
    expect(opts[0].iri).toBe('xnet://xnet.fyi/Note')
  })
})

describe('propertyTypeToFieldType', () => {
  it('maps json to text', () => {
    expect(propertyTypeToFieldType('json')).toBe('text')
  })
  it('passes other types through', () => {
    expect(propertyTypeToFieldType('number')).toBe('number')
  })
})

describe('buildGridFields', () => {
  it('starts with the id column and ends with system columns', () => {
    const fields = buildGridFields(makeSchema(), [], false)
    expect(fields[0].id).toBe(SYSTEM_FIELD.id)
    expect(fields.at(-2)?.id).toBe(SYSTEM_FIELD.updated)
    expect(fields.at(-1)?.id).toBe(SYSTEM_FIELD.author)
  })

  it('skips auto property types (rendered as system columns)', () => {
    const ids = buildGridFields(makeSchema(), [], false).map((f) => f.id)
    expect(ids).not.toContain('updatedAt') // the schema "updated" prop is omitted
    expect(ids).toContain('title')
  })

  it('downgrades an option-less select to a text column (never crash a select cell)', () => {
    const status = buildGridFields(makeSchema(), [], false).find((f) => f.id === 'status')
    expect(status?.type).toBe('text')
  })

  it('synthesizes text columns from observed keys when no schema is known', () => {
    const fields = buildGridFields(null, ['foo', 'bar'], true)
    const ids = fields.map((f) => f.id)
    expect(ids).toContain(SYSTEM_FIELD.schema)
    expect(ids).toContain('foo')
    expect(fields.find((f) => f.id === 'foo')?.type).toBe('text')
  })

  it('locks every column by default (read-only browser)', () => {
    for (const f of buildGridFields(makeSchema(), [], false)) {
      expect(f.readonly).toBe(true)
    }
  })

  it('unlocks only inline-editable property columns when editable', () => {
    const byId = Object.fromEntries(
      buildGridFields(makeSchema(), [], false, true).map((f) => [f.id, f])
    )
    expect(byId[SYSTEM_FIELD.id].readonly).toBe(true) // system column stays locked
    expect(byId.title.readonly).toBe(false) // text -> editable
    expect(byId.count.readonly).toBe(false) // number -> editable
    expect(byId.meta.readonly).toBe(true) // json -> locked
    expect(byId.status.readonly).toBe(true) // option-less select -> locked
  })

  it('keeps synthesized columns read-only even in edit mode', () => {
    const foo = buildGridFields(null, ['foo'], true, true).find((f) => f.id === 'foo')
    expect(foo?.readonly).toBe(true)
  })
})

describe('coerceCellValue', () => {
  it('passes primitives through', () => {
    expect(coerceCellValue('x')).toBe('x')
    expect(coerceCellValue(5)).toBe(5)
    expect(coerceCellValue(true)).toBe(true)
    expect(coerceCellValue(null)).toBeNull()
    expect(coerceCellValue(undefined)).toBeNull()
  })
  it('keeps a string array', () => {
    expect(coerceCellValue(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('stringifies objects and mixed arrays', () => {
    expect(coerceCellValue({ a: 1 })).toBe('{"a":1}')
    expect(coerceCellValue([1, 2])).toBe('[1,2]')
  })
})

describe('coerceCellValueForType', () => {
  it('stringifies non-strings for text-family fields (the str.replace crash fix)', () => {
    expect(coerceCellValueForType(3, 'text')).toBe('3')
    expect(coerceCellValueForType(true, 'text')).toBe('true')
    expect(coerceCellValueForType({ a: 1 }, 'text')).toBe('{"a":1}')
    expect(coerceCellValueForType(42, 'url')).toBe('42')
  })
  it('keeps numbers for number fields and coerces numeric strings', () => {
    expect(coerceCellValueForType(3, 'number')).toBe(3)
    expect(coerceCellValueForType('7', 'number')).toBe(7)
    expect(coerceCellValueForType('nope', 'number')).toBeNull()
  })
  it('coerces checkbox + multiSelect shapes', () => {
    expect(coerceCellValueForType(1, 'checkbox')).toBe(true)
    expect(coerceCellValueForType(['a', 'b'], 'multiSelect')).toEqual(['a', 'b'])
    expect(coerceCellValueForType('solo', 'multiSelect')).toEqual(['solo'])
  })
  it('passes native shapes through for date/dateRange/relation/person/file renderers', () => {
    // date renderers want an epoch NUMBER, not a stringified one (Invalid Date).
    expect(coerceCellValueForType(1_700_000_000_000, 'date')).toBe(1_700_000_000_000)
    expect(coerceCellValueForType('1700000000000', 'date')).toBe(1_700_000_000_000)
    // an ISO string from the inline editor round-trips to an epoch.
    expect(coerceCellValueForType('2026-01-15', 'date')).toBe(Date.parse('2026-01-15'))
    // dateRange wants a {start,end} object.
    const range = { start: '2026-01-01', end: '2026-01-31' }
    expect(coerceCellValueForType(range, 'dateRange')).toEqual(range)
    expect(coerceCellValueForType('not-a-range', 'dateRange')).toBeNull()
    // relation/person want an array.
    expect(coerceCellValueForType(['n1', 'n2'], 'relation')).toEqual(['n1', 'n2'])
    expect(coerceCellValueForType('n1', 'relation')).toEqual(['n1'])
    // file wants a FileRef object (with a cid).
    const fileRef = { cid: 'abc', name: 'f.png', mimeType: 'image/png', size: 10 }
    expect(coerceCellValueForType(fileRef, 'file')).toEqual(fileRef)
    expect(coerceCellValueForType('garbage', 'file')).toBeNull()
  })
  it('returns null for nullish', () => {
    expect(coerceCellValueForType(null, 'text')).toBeNull()
    expect(coerceCellValueForType(undefined, 'number')).toBeNull()
  })
})

describe('nodeToGridRow', () => {
  it('builds system cells plus property cells keyed by field id, coerced by type', () => {
    const types = new Map<string, FieldType>([
      ['title', 'text'],
      ['count', 'number']
    ])
    const row = nodeToGridRow(makeNode({ title: 'Hello', count: 3 }), types)
    expect(row.id).toBe('node-1')
    expect(row.cells[SYSTEM_FIELD.id]).toBe('node-1')
    expect(row.cells[SYSTEM_FIELD.schema]).toBe('Task@1.0.0')
    expect(row.cells.title).toBe('Hello')
    expect(row.cells.count).toBe(3)
    expect(typeof row.cells[SYSTEM_FIELD.author]).toBe('string')
  })

  it('stores Updated as an epoch number (sortable) and carries a stable sortKey', () => {
    const row = nodeToGridRow(makeNode({ title: 'x' }))
    // makeNode sets updatedAt: 1_700_000_500_000
    expect(row.cells[SYSTEM_FIELD.updated]).toBe(1_700_000_500_000)
    expect(row.sortKey).toBe('node-1')
  })

  it('defaults unknown property columns to text (stringifying numbers)', () => {
    const row = nodeToGridRow(makeNode({ score: 9 }))
    expect(row.cells.score).toBe('9')
  })
})

describe('gridFieldsToColumnDefinitions', () => {
  it('maps grid fields to column definitions (id/name/type/config preserved)', () => {
    const cols = gridFieldsToColumnDefinitions(buildGridFields(makeSchema(), [], false))
    const updated = cols.find((c) => c.id === SYSTEM_FIELD.updated)
    expect(updated?.type).toBe('updated') // sortable Updated column (no broken `equals`)
    const title = cols.find((c) => c.id === 'title')
    expect(title?.type).toBe('text')
    expect(cols.find((c) => c.id === SYSTEM_FIELD.id)?.isTitle).toBe(true)
  })
})

describe('observedPropertyKeys', () => {
  it('collects the union of keys and caps the count', () => {
    const nodes = [makeNode({ a: 1, b: 2 }), makeNode({ b: 3, c: 4 })]
    expect(observedPropertyKeys(nodes).sort()).toEqual(['a', 'b', 'c'])
    expect(observedPropertyKeys(nodes, 2).length).toBe(2)
  })
})

describe('formatPlanRows', () => {
  it('renders the core plan metrics', () => {
    const rows = formatPlanRows({
      strategy: 'storage-query',
      candidateNodeCount: 12,
      hydratedNodeCount: 10,
      returnedNodeCount: 10,
      durationMs: 4.2
    })
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map.Strategy).toBe('storage-query')
    expect(map.Returned).toBe('10')
    expect(map.Duration).toBe('4.2ms')
  })
})
