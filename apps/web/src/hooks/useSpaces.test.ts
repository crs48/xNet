import { describe, expect, it } from 'vitest'
import { activeSpaces, toSpaceEntry, type SpaceEntry } from './useSpaces'

describe('toSpaceEntry', () => {
  it('applies defaults for kind and visibility', () => {
    const entry = toSpaceEntry({ id: 's1', name: 'Acme' })
    expect(entry).toMatchObject({
      id: 's1',
      name: 'Acme',
      kind: 'workspace',
      visibility: 'private',
      parent: null,
      archived: false
    })
  })

  it('preserves provided fields', () => {
    const entry = toSpaceEntry({
      id: 's2',
      name: 'Family',
      kind: 'family',
      parent: 's1',
      visibility: 'public',
      archived: true
    })
    expect(entry.kind).toBe('family')
    expect(entry.parent).toBe('s1')
    expect(entry.visibility).toBe('public')
    expect(entry.archived).toBe(true)
  })
})

describe('activeSpaces', () => {
  it('drops archived and unnamed spaces', () => {
    const spaces: SpaceEntry[] = [
      { id: 's1', name: 'Eng', kind: 'team', visibility: 'private' },
      { id: 's2', name: 'Old', kind: 'team', visibility: 'private', archived: true },
      { id: 's3', name: '', kind: 'team', visibility: 'private' }
    ]
    expect(activeSpaces(spaces).map((s) => s.id)).toEqual(['s1'])
  })
})
