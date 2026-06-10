/**
 * Clipboard tests — TSV round-trips and per-type coercion.
 */

import { describe, it, expect } from 'vitest'
import {
  serializeTsv,
  parseTsv,
  formatCellText,
  coerceCellText,
  type CopyField,
  type PasteField
} from './clipboard'

const textField: CopyField & PasteField = { id: 'f1', type: 'text' }

describe('serializeTsv / formatCellText', () => {
  it('serializes a simple block', () => {
    const tsv = serializeTsv(
      [
        ['a', 'b'],
        ['c', 'd']
      ],
      [textField, { id: 'f2', type: 'text' }]
    )
    expect(tsv).toBe('a\tb\nc\td')
  })

  it('quotes cells containing tabs, newlines, quotes', () => {
    const tsv = serializeTsv(
      [['line1\nline2', 'has\ttab', 'say "hi"']],
      [textField, textField, textField]
    )
    expect(tsv).toBe('"line1\nline2"\t"has\ttab"\t"say ""hi"""')
  })

  it('formats checkboxes as TRUE/FALSE', () => {
    const f: CopyField = { id: 'c', type: 'checkbox' }
    expect(formatCellText(true, f)).toBe('TRUE')
    expect(formatCellText(false, f)).toBe('FALSE')
    expect(formatCellText(null, f)).toBe('')
  })

  it('resolves select option names', () => {
    const f: CopyField = {
      id: 's',
      type: 'select',
      optionName: (id) => ({ o1: 'High', o2: 'Low' })[id]
    }
    expect(formatCellText('o1', f)).toBe('High')
    expect(formatCellText('unknown', f)).toBe('unknown')
  })

  it('joins multiSelect names with commas', () => {
    const f: CopyField = {
      id: 'm',
      type: 'multiSelect',
      optionName: (id) => ({ o1: 'red', o2: 'blue' })[id]
    }
    expect(formatCellText(['o1', 'o2'], f)).toBe('red, blue')
  })

  it('formats date ranges and files', () => {
    expect(
      formatCellText({ start: '2026-01-01', end: '2026-01-31' }, { id: 'd', type: 'dateRange' })
    ).toBe('2026-01-01 → 2026-01-31')
    expect(
      formatCellText(
        { id: 'x', name: 'photo.png', size: 1, type: 'image/png', url: 'u' },
        { id: 'f', type: 'file' }
      )
    ).toBe('photo.png')
  })
})

describe('parseTsv', () => {
  it('parses rows and columns', () => {
    expect(parseTsv('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('handles \\r\\n and trailing newline', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('parses quoted cells with embedded tabs/newlines/quotes', () => {
    expect(parseTsv('"line1\nline2"\t"say ""hi"""')).toEqual([['line1\nline2', 'say "hi"']])
  })

  it('parses empty input as a single empty cell', () => {
    expect(parseTsv('')).toEqual([['']])
  })

  it('round-trips serialize -> parse', () => {
    const block = [
      ['a "quote"', 'tab\there'],
      ['new\nline', 'plain']
    ]
    const fields = [textField, textField]
    expect(parseTsv(serializeTsv(block, fields))).toEqual(block)
  })
})

describe('coerceCellText', () => {
  it('text passes through, empty clears', () => {
    expect(coerceCellText('hello', textField)).toEqual({ value: 'hello' })
    expect(coerceCellText('', textField)).toEqual({ value: null })
  })

  it('numbers parse with currency/percent/thousands cleanup', () => {
    const f: PasteField = { id: 'n', type: 'number' }
    expect(coerceCellText('42', f)).toEqual({ value: 42 })
    expect(coerceCellText('$1,234.50', f)).toEqual({ value: 1234.5 })
    expect(coerceCellText('15%', f)).toEqual({ value: 0.15 })
    expect(coerceCellText('-3.5', f)).toEqual({ value: -3.5 })
    expect(coerceCellText('abc', f)).toEqual({ value: null, lossy: true })
    expect(coerceCellText('', f)).toEqual({ value: null })
  })

  it('checkboxes accept truthy/falsy spellings', () => {
    const f: PasteField = { id: 'c', type: 'checkbox' }
    expect(coerceCellText('TRUE', f)).toEqual({ value: true })
    expect(coerceCellText('yes', f)).toEqual({ value: true })
    expect(coerceCellText('x', f)).toEqual({ value: true })
    expect(coerceCellText('FALSE', f)).toEqual({ value: false })
    expect(coerceCellText('0', f)).toEqual({ value: false })
    expect(coerceCellText('', f)).toEqual({ value: false })
    expect(coerceCellText('maybe', f)).toEqual({ value: null, lossy: true })
  })

  it('dates parse to ISO strings', () => {
    const f: PasteField = { id: 'd', type: 'date' }
    const result = coerceCellText('2026-06-10', f)
    expect(typeof result.value).toBe('string')
    expect(result.value as string).toMatch(/^2026-06-10T/)
    expect(coerceCellText('not a date', f)).toEqual({ value: null, lossy: true })
  })

  it('date ranges parse start/end with several separators', () => {
    const f: PasteField = { id: 'r', type: 'dateRange' }
    for (const sep of ['→', '->', 'to']) {
      const result = coerceCellText(`2026-01-01 ${sep} 2026-01-31`, f)
      expect(result.lossy).toBeUndefined()
      expect((result.value as { start: string }).start).toMatch(/^2026-01-01T/)
    }
  })

  it('select resolves names to option ids; unresolved reported', () => {
    const f: PasteField = {
      id: 's',
      type: 'select',
      optionIdByName: (name) => ({ High: 'o1' })[name]
    }
    expect(coerceCellText('High', f)).toEqual({ value: 'o1' })
    expect(coerceCellText('Medium', f)).toEqual({ value: null, unresolvedOptions: ['Medium'] })
  })

  it('multiSelect resolves a comma list, reporting unresolved names', () => {
    const f: PasteField = {
      id: 'm',
      type: 'multiSelect',
      optionIdByName: (name) => ({ red: 'o1', blue: 'o2' })[name]
    }
    expect(coerceCellText('red, blue', f)).toEqual({ value: ['o1', 'o2'] })
    expect(coerceCellText('red, green', f)).toEqual({
      value: ['o1'],
      unresolvedOptions: ['green']
    })
  })

  it('person/relation/file/computed targets are lossy for non-empty text', () => {
    for (const type of ['person', 'relation', 'file', 'rollup', 'formula'] as const) {
      expect(coerceCellText('something', { id: 'x', type })).toEqual({ value: null, lossy: true })
      expect(coerceCellText('', { id: 'x', type }).lossy).toBeFalsy()
    }
  })
})
