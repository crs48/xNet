/**
 * Cell conversion tests — retyping a field coerces existing values.
 */

import { describe, it, expect } from 'vitest'
import { convertCellValue, cellValueToText } from './convert-cell'

describe('convertCellValue', () => {
  it('text → number parses numerics and currency', () => {
    expect(convertCellValue('42', 'text', 'number')).toEqual({ value: 42 })
    expect(convertCellValue('$1,234.50', 'text', 'number')).toEqual({ value: 1234.5 })
    expect(convertCellValue('15%', 'text', 'number')).toEqual({ value: 0.15 })
    expect(convertCellValue('abc', 'text', 'number')).toEqual({ value: null })
  })

  it('text → multiSelect splits comma-separated values into option names', () => {
    expect(convertCellValue('red, blue, red', 'text', 'multiSelect')).toEqual({
      value: null,
      optionNames: ['red', 'blue']
    })
    expect(convertCellValue('solo', 'text', 'multiSelect')).toEqual({
      value: null,
      optionNames: ['solo']
    })
  })

  it('text → select takes the first comma-separated entry', () => {
    expect(convertCellValue('high, low', 'text', 'select')).toEqual({
      value: null,
      optionNames: ['high']
    })
  })

  it('text → checkbox and date', () => {
    expect(convertCellValue('yes', 'text', 'checkbox')).toEqual({ value: true })
    expect(convertCellValue('nope', 'text', 'checkbox')).toEqual({ value: false })
    const date = convertCellValue('2026-06-10', 'text', 'date')
    expect(String(date.value)).toMatch(/^2026-06-10T/)
  })

  it('number → text and checkbox', () => {
    expect(convertCellValue(42, 'number', 'text')).toEqual({ value: '42' })
    expect(convertCellValue(0, 'number', 'checkbox')).toEqual({ value: false })
    expect(convertCellValue(7, 'number', 'checkbox')).toEqual({ value: true })
  })

  it('select/multiSelect → text resolves option names', () => {
    const ctx = { optionName: (id: string) => ({ o1: 'High', o2: 'Low' })[id] }
    expect(convertCellValue('o1', 'select', 'text', ctx)).toEqual({ value: 'High' })
    expect(convertCellValue(['o1', 'o2'], 'multiSelect', 'text', ctx)).toEqual({
      value: 'High, Low'
    })
  })

  it('select → multiSelect carries the option name', () => {
    const ctx = { optionName: (id: string) => ({ o1: 'High' })[id] }
    expect(convertCellValue('o1', 'select', 'multiSelect', ctx)).toEqual({
      value: null,
      optionNames: ['High']
    })
  })

  it('null and empty values clear', () => {
    expect(convertCellValue(null, 'text', 'number')).toEqual({ value: null })
    expect(convertCellValue('   ', 'text', 'number')).toEqual({ value: null })
  })

  it('non-convertible targets clear', () => {
    expect(convertCellValue('something', 'text', 'file')).toEqual({ value: null })
    expect(convertCellValue('something', 'text', 'relation')).toEqual({ value: null })
  })

  it('text → geo parses "lat, lng" pairs and rejects garbage', () => {
    expect(convertCellValue('52.52, 13.405', 'text', 'geo')).toEqual({
      value: { lat: 52.52, lng: 13.405 }
    })
    expect(convertCellValue('99, 0', 'text', 'geo')).toEqual({ value: null })
    expect(convertCellValue('somewhere', 'text', 'geo')).toEqual({ value: null })
  })

  it('geo → text round-trips through the pair rendering', () => {
    expect(convertCellValue({ lat: 52.52, lng: 13.405 }, 'geo', 'text')).toEqual({
      value: '52.52, 13.405'
    })
    expect(convertCellValue({ lat: 52.52, lng: 13.405 }, 'geo', 'geo')).toEqual({
      value: { lat: 52.52, lng: 13.405 }
    })
    const back = convertCellValue('52.52, 13.405', 'text', 'geo')
    expect(back.value).toEqual({ lat: 52.52, lng: 13.405 })
  })

  it('person only accepts DIDs', () => {
    expect(convertCellValue('did:key:z6Mk', 'text', 'person')).toEqual({ value: 'did:key:z6Mk' })
    expect(convertCellValue('alice', 'text', 'person')).toEqual({ value: null })
  })
})

describe('cellValueToText', () => {
  it('joins arrays and formats checkboxes', () => {
    expect(cellValueToText(true, 'checkbox')).toBe('true')
    expect(cellValueToText(['a', 'b'], 'text')).toBe('a, b')
  })
})
