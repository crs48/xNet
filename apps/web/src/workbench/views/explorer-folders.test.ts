import { describe, expect, it } from 'vitest'
import { appendSortKey, insertBeforeSortKey, partitionByFolder } from './explorer-folders'

describe('partitionByFolder', () => {
  it('splits unfiled (null, undefined, empty) from filed items', () => {
    const { unfiled, byFolder } = partitionByFolder([
      { id: 'a' },
      { id: 'b', folder: null },
      { id: 'c', folder: '' },
      { id: 'd', folder: 'f1' }
    ])
    expect(unfiled.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(byFolder.get('f1')?.map((item) => item.id)).toEqual(['d'])
  })

  it('orders folder siblings by sortKey using code units', () => {
    const { byFolder } = partitionByFolder([
      { id: 'lower', folder: 'f1', sortKey: 'a' },
      { id: 'upper', folder: 'f1', sortKey: 'Z' }
    ])
    // 'Z' (0x5A) < 'a' (0x61) by code units; localeCompare would flip it
    expect(byFolder.get('f1')?.map((item) => item.id)).toEqual(['upper', 'lower'])
  })

  it('breaks sortKey ties by recency', () => {
    const { byFolder } = partitionByFolder([
      { id: 'old', folder: 'f1', updatedAt: 1 },
      { id: 'new', folder: 'f1', updatedAt: 2 }
    ])
    expect(byFolder.get('f1')?.map((item) => item.id)).toEqual(['new', 'old'])
  })
})

describe('appendSortKey', () => {
  it('starts a fresh sequence for an empty folder', () => {
    expect(appendSortKey([])).toBeTruthy()
  })

  it('generates a key after the last sibling', () => {
    const key = appendSortKey([
      { id: 'a', sortKey: 'a0' },
      { id: 'b', sortKey: 'a1' }
    ])
    expect(key > 'a1').toBe(true)
  })

  it('treats missing sortKeys on the last sibling as a fresh append', () => {
    expect(appendSortKey([{ id: 'a' }])).toBeTruthy()
  })
})

describe('insertBeforeSortKey', () => {
  const siblings = [
    { id: 'a', sortKey: 'a0' },
    { id: 'b', sortKey: 'a1' },
    { id: 'c', sortKey: 'a2' }
  ]

  it('inserts between the predecessor and the target', () => {
    const key = insertBeforeSortKey(siblings, 'b')
    expect(key > 'a0').toBe(true)
    expect(key < 'a1').toBe(true)
  })

  it('inserts before the first sibling', () => {
    const key = insertBeforeSortKey(siblings, 'a')
    expect(key < 'a0').toBe(true)
  })

  it('appends when the target is unknown', () => {
    const key = insertBeforeSortKey(siblings, 'missing')
    expect(key > 'a2').toBe(true)
  })
})
