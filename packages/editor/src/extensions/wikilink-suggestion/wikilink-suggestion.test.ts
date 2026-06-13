/**
 * Tests for the `[[` wikilink typeahead helpers (exploration 0170).
 */
import { describe, expect, it } from 'vitest'
import {
  CREATE_WIKILINK_ID,
  buildWikilinkMenuItems,
  endAfterClosingBrackets,
  matchWikilinkTargets,
  parseWikilinkQuery,
  wikilinkInsertContent,
  type WikilinkTarget
} from './WikilinkSuggestionExtension'

const TARGETS: WikilinkTarget[] = [
  { href: 'page-aaaaaaaaaaaaaaaaa', title: 'Launch Plan', kind: 'page' },
  { href: 'xnet://database/db-bbbbbbbbbbbbb', title: 'Launch Tracker', kind: 'database' },
  { href: 'xnet://dashboard/dash-ccccccccc', title: 'Metrics Dashboard', kind: 'dashboard' },
  { href: 'page-ddddddddddddddddd', title: 'Plan Archive', kind: 'page' }
]

describe('parseWikilinkQuery', () => {
  it('returns the trimmed query with no alias by default', () => {
    expect(parseWikilinkQuery(' launch ')).toEqual({ search: 'launch', alias: null })
  })

  it('splits on the first pipe into search and alias', () => {
    expect(parseWikilinkQuery('launch|the plan')).toEqual({
      search: 'launch',
      alias: 'the plan'
    })
  })

  it('treats an empty alias as absent', () => {
    expect(parseWikilinkQuery('launch|')).toEqual({ search: 'launch', alias: null })
  })

  it('keeps later pipes inside the alias', () => {
    expect(parseWikilinkQuery('a|b|c')).toEqual({ search: 'a', alias: 'b|c' })
  })
})

describe('matchWikilinkTargets', () => {
  it('returns the head of the list for an empty search', () => {
    expect(matchWikilinkTargets(TARGETS, '', 2)).toEqual(TARGETS.slice(0, 2))
  })

  it('ranks prefix matches before substring matches, case-insensitively', () => {
    const titles = matchWikilinkTargets(TARGETS, 'launch').map((t) => t.title)
    expect(titles).toEqual(['Launch Plan', 'Launch Tracker'])

    const plan = matchWikilinkTargets(TARGETS, 'plan').map((t) => t.title)
    expect(plan).toEqual(['Plan Archive', 'Launch Plan'])
  })

  it('caps the result list', () => {
    expect(matchWikilinkTargets(TARGETS, '', 1)).toHaveLength(1)
  })

  it('drops non-matching targets', () => {
    expect(matchWikilinkTargets(TARGETS, 'zzz')).toHaveLength(0)
  })
})

describe('buildWikilinkMenuItems', () => {
  it('maps targets to menu items with href ids and kind subtitles', () => {
    const items = buildWikilinkMenuItems(TARGETS, 'metrics', false)
    expect(items).toEqual([
      {
        id: 'xnet://dashboard/dash-ccccccccc',
        label: 'Metrics Dashboard',
        kind: 'dashboard',
        subtitle: 'dashboard'
      }
    ])
  })

  it('uses the alias as the label when present', () => {
    const items = buildWikilinkMenuItems(TARGETS, 'metrics|the numbers', false)
    expect(items[0]?.label).toBe('the numbers')
  })

  it('appends a create row for unknown titles when creation is enabled', () => {
    const items = buildWikilinkMenuItems(TARGETS, 'Brand Refresh', true)
    const create = items.at(-1)
    expect(create).toEqual({
      id: CREATE_WIKILINK_ID,
      label: 'Brand Refresh',
      kind: 'create',
      subtitle: 'Create page',
      createTitle: 'Brand Refresh'
    })
  })

  it('keeps the typed title as createTitle when an alias is present', () => {
    const items = buildWikilinkMenuItems(TARGETS, 'Brand Refresh|brand', true)
    const create = items.at(-1)
    expect(create?.label).toBe('brand')
    expect(create?.createTitle).toBe('Brand Refresh')
  })

  it('omits the create row on an exact title match (case-insensitive)', () => {
    const items = buildWikilinkMenuItems(TARGETS, 'launch plan', true)
    expect(items.some((item) => item.id === CREATE_WIKILINK_ID)).toBe(false)
  })

  it('omits the create row when creation is disabled or the query is empty', () => {
    expect(
      buildWikilinkMenuItems(TARGETS, 'Brand Refresh', false).some(
        (item) => item.id === CREATE_WIKILINK_ID
      )
    ).toBe(false)
    expect(
      buildWikilinkMenuItems(TARGETS, '', true).some((item) => item.id === CREATE_WIKILINK_ID)
    ).toBe(false)
  })
})

describe('endAfterClosingBrackets', () => {
  function docStub(text: string) {
    return {
      content: { size: text.length },
      textBetween: (from: number, to: number) => text.slice(from, to)
    }
  }

  it('extends the range over a trailing ]]', () => {
    expect(endAfterClosingBrackets(docStub('[[plan]] more'), 6)).toBe(8)
  })

  it('leaves the range alone without a trailing ]]', () => {
    expect(endAfterClosingBrackets(docStub('[[plan more'), 6)).toBe(6)
  })

  it('clamps the probe at the end of the document', () => {
    expect(endAfterClosingBrackets(docStub('[[plan]'), 6)).toBe(6)
  })
})

describe('wikilinkInsertContent', () => {
  it('builds marked link text followed by an unmarked space', () => {
    expect(wikilinkInsertContent('node-id', 'Launch Plan')).toEqual([
      {
        type: 'text',
        text: 'Launch Plan',
        marks: [{ type: 'wikilink', attrs: { href: 'node-id', title: 'Launch Plan' } }]
      },
      { type: 'text', text: ' ' }
    ])
  })
})
