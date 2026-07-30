import { describe, expect, it } from 'vitest'
import { sortExplorerItems } from './explorer-sort'

const items = [
  { title: 'banana', type: 'page', updatedAt: 1 },
  { title: 'Apple', type: 'canvas', updatedAt: 3 },
  { title: 'cherry', type: 'database', updatedAt: 2 }
]

describe('sortExplorerItems', () => {
  it('recent sorts by updatedAt desc', () => {
    expect(sortExplorerItems(items, 'recent').map((i) => i.title)).toEqual([
      'Apple',
      'cherry',
      'banana'
    ])
  })

  it('name sorts case-insensitively A→Z', () => {
    expect(sortExplorerItems(items, 'name').map((i) => i.title)).toEqual([
      'Apple',
      'banana',
      'cherry'
    ])
  })

  it('type sorts by type then recency', () => {
    expect(sortExplorerItems(items, 'type').map((i) => i.type)).toEqual([
      'canvas',
      'database',
      'page'
    ])
  })

  it('created sorts by createdAt desc (independent of updatedAt)', () => {
    const dated = [
      { title: 'old-edit-new', type: 'page', updatedAt: 9, createdAt: 1 },
      { title: 'new-edit-old', type: 'page', updatedAt: 1, createdAt: 9 },
      { title: 'middle', type: 'page', updatedAt: 5, createdAt: 5 }
    ]
    expect(sortExplorerItems(dated, 'created').map((i) => i.title)).toEqual([
      'new-edit-old',
      'middle',
      'old-edit-new'
    ])
  })

  it('created falls back to recency when createdAt is missing', () => {
    expect(sortExplorerItems(items, 'created').map((i) => i.title)).toEqual([
      'Apple',
      'cherry',
      'banana'
    ])
  })

  it('does not mutate the input', () => {
    const input = items.slice()
    sortExplorerItems(input, 'name')
    expect(input.map((i) => i.title)).toEqual(['banana', 'Apple', 'cherry'])
  })

  it('breaks name ties by recency', () => {
    const dupes = [
      { title: 'Doc', type: 'page', updatedAt: 1 },
      { title: 'doc', type: 'page', updatedAt: 5 }
    ]
    expect(sortExplorerItems(dupes, 'name').map((i) => i.updatedAt)).toEqual([5, 1])
  })
})
