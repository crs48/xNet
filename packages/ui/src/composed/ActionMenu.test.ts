/**
 * Tests for ActionMenu descriptor filtering (exploration 0285).
 */
import { describe, expect, it } from 'vitest'
import { ACTION_SEPARATOR, visibleActions, type Action } from './ActionMenu'

const sep: Action = { id: ACTION_SEPARATOR }

describe('visibleActions', () => {
  it('hides actions whose when() is false', () => {
    const actions: Action[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', when: () => false },
      { id: 'c', label: 'C', when: () => true }
    ]
    expect(visibleActions(actions).map((a) => a.id)).toEqual(['a', 'c'])
  })

  it('drops leading and trailing separators', () => {
    const actions: Action[] = [sep, { id: 'a' }, sep]
    expect(visibleActions(actions).map((a) => a.id)).toEqual(['a'])
  })

  it('collapses consecutive separators', () => {
    const actions: Action[] = [{ id: 'a' }, sep, sep, { id: 'b' }]
    expect(visibleActions(actions).map((a) => a.id)).toEqual(['a', ACTION_SEPARATOR, 'b'])
  })

  it('drops a separator orphaned by a hidden neighbour', () => {
    const actions: Action[] = [
      { id: 'a' },
      sep,
      { id: 'b', when: () => false } // hiding b leaves the separator trailing
    ]
    expect(visibleActions(actions).map((a) => a.id)).toEqual(['a'])
  })

  it('keeps a separator between two visible groups', () => {
    const actions: Action[] = [{ id: 'a' }, sep, { id: 'b' }]
    expect(visibleActions(actions).map((a) => a.id)).toEqual(['a', ACTION_SEPARATOR, 'b'])
  })
})
