import { describe, expect, it } from 'vitest'
import { dedupeTagsByName } from './useWorkspaceTags'

describe('dedupeTagsByName', () => {
  it('keeps the first tag per name (offline twins collapse on sight)', () => {
    const deduped = dedupeTagsByName([
      { id: 't1', name: 'design' },
      { id: 't2', name: 'design' },
      { id: 't3', name: 'perf' }
    ])
    expect(deduped.map((tag) => tag.id)).toEqual(['t1', 't3'])
  })

  it('drops archived and unnamed tags', () => {
    const deduped = dedupeTagsByName([
      { id: 't1', name: 'design', archived: true },
      { id: 't2', name: '' },
      { id: 't3', name: 'perf' }
    ])
    expect(deduped.map((tag) => tag.id)).toEqual(['t3'])
  })
})
