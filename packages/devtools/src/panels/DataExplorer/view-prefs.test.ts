import type { SortConfig } from '@xnetjs/data'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW_PREFS,
  cycleSort,
  loadViewPrefs,
  saveViewPrefs,
  type DataViewPrefs
} from './view-prefs'

describe('cycleSort', () => {
  it('none → asc → desc → none for the same column', () => {
    let sorts: SortConfig[] = []
    sorts = cycleSort(sorts, 'title')
    expect(sorts).toEqual([{ columnId: 'title', direction: 'asc' }])
    sorts = cycleSort(sorts, 'title')
    expect(sorts).toEqual([{ columnId: 'title', direction: 'desc' }])
    sorts = cycleSort(sorts, 'title')
    expect(sorts).toEqual([])
  })

  it('clicking a different column replaces the sort (single-column)', () => {
    const sorts = cycleSort([{ columnId: 'title', direction: 'desc' }], 'count')
    expect(sorts).toEqual([{ columnId: 'count', direction: 'asc' }])
  })
})

describe('view prefs persistence', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults on a miss', () => {
    expect(loadViewPrefs('xnet://x/Task@1.0.0')).toEqual(DEFAULT_VIEW_PREFS)
  })

  it('round-trips saved prefs per schema', () => {
    const prefs: DataViewPrefs = {
      sorts: [{ columnId: 'title', direction: 'asc' }],
      filters: {
        operator: 'and',
        conditions: [{ columnId: 'count', operator: 'greaterThan', value: 3 }]
      },
      rowHeight: 'tall',
      hiddenFieldIds: ['@@author']
    }
    saveViewPrefs('xnet://x/Task@1.0.0', prefs)
    expect(loadViewPrefs('xnet://x/Task@1.0.0')).toEqual(prefs)
    // a different schema keeps its own (default) prefs
    expect(loadViewPrefs('xnet://x/Note@1.0.0')).toEqual(DEFAULT_VIEW_PREFS)
  })

  it('keys the All-schemas view separately from a schema', () => {
    saveViewPrefs(null, { ...DEFAULT_VIEW_PREFS, rowHeight: 'medium' })
    expect(loadViewPrefs(null).rowHeight).toBe('medium')
    expect(loadViewPrefs('xnet://x/Task@1.0.0').rowHeight).toBe('short')
  })

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem('xnet:devtools:data:xnet://x/Task@1.0.0', '{not json')
    expect(loadViewPrefs('xnet://x/Task@1.0.0')).toEqual(DEFAULT_VIEW_PREFS)
  })

  it('rejects an invalid rowHeight', () => {
    localStorage.setItem('xnet:devtools:data:@@all', JSON.stringify({ rowHeight: 'huge' }))
    expect(loadViewPrefs(null).rowHeight).toBe(DEFAULT_VIEW_PREFS.rowHeight)
  })
})
