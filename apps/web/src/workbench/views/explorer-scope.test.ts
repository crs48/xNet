import { describe, expect, it } from 'vitest'
import {
  NO_SPACE,
  isRealSpace,
  matchesScope,
  nodeSpaceId,
  scopeKeyOf,
  toggleScopeSelection
} from './explorer-scope'

describe('nodeSpaceId', () => {
  const nodes = [{ id: 'n1', space: 's1' }, { id: 'n2', space: '' }, { id: 'n3' }]
  it('returns the space id for a filed node', () => {
    expect(nodeSpaceId('n1', nodes)).toBe('s1')
  })
  it('returns null for space-less, unknown, or missing inputs', () => {
    expect(nodeSpaceId('n2', nodes)).toBeNull()
    expect(nodeSpaceId('n3', nodes)).toBeNull()
    expect(nodeSpaceId('nope', nodes)).toBeNull()
    expect(nodeSpaceId('n1', null)).toBeNull()
  })
})

describe('scopeKeyOf', () => {
  it('maps space-less values to the NO_SPACE sentinel', () => {
    expect(scopeKeyOf(undefined)).toBe(NO_SPACE)
    expect(scopeKeyOf(null)).toBe(NO_SPACE)
    expect(scopeKeyOf('')).toBe(NO_SPACE)
  })
  it('passes a real space id through', () => {
    expect(scopeKeyOf('s1')).toBe('s1')
  })
})

describe('isRealSpace', () => {
  it('is true only for concrete space ids', () => {
    expect(isRealSpace('s1')).toBe(true)
    expect(isRealSpace(null)).toBe(false)
    expect(isRealSpace(NO_SPACE)).toBe(false)
  })
})

describe('matchesScope', () => {
  it('All (null, no filter) matches everything', () => {
    expect(matchesScope('s1', null)).toBe(true)
    expect(matchesScope('', null)).toBe(true)
    expect(matchesScope(undefined, null)).toBe(true)
  })

  it('a single real scope matches only that space', () => {
    expect(matchesScope('s1', 's1')).toBe(true)
    expect(matchesScope('s2', 's1')).toBe(false)
    expect(matchesScope('', 's1')).toBe(false)
  })

  it('the NO_SPACE scope matches only space-less nodes', () => {
    expect(matchesScope('', NO_SPACE)).toBe(true)
    expect(matchesScope(undefined, NO_SPACE)).toBe(true)
    expect(matchesScope('s1', NO_SPACE)).toBe(false)
  })

  it('a non-empty filter is the union of its members (ignores single scope)', () => {
    expect(matchesScope('s1', 's3', ['s1', 's2'])).toBe(true)
    expect(matchesScope('s2', null, ['s1', 's2'])).toBe(true)
    expect(matchesScope('s3', 's1', ['s1', 's2'])).toBe(false)
  })

  it('a filter can include the No-workspace bucket', () => {
    expect(matchesScope('', null, ['s1', NO_SPACE])).toBe(true)
    expect(matchesScope('s2', null, ['s1', NO_SPACE])).toBe(false)
  })
})

describe('toggleScopeSelection', () => {
  it('plain click sets a single scope and clears the filter', () => {
    expect(toggleScopeSelection({ scope: null, filter: [] }, 's1', false)).toEqual({
      scope: 's1',
      filter: []
    })
    expect(toggleScopeSelection({ scope: 's2', filter: ['s2', 's3'] }, 's1', false)).toEqual({
      scope: 's1',
      filter: []
    })
  })

  it('cmd-click from a single scope seeds a two-space filter', () => {
    expect(toggleScopeSelection({ scope: 's1', filter: [] }, 's2', true)).toEqual({
      scope: 's1',
      filter: ['s1', 's2']
    })
  })

  it('cmd-click from All starts a single-element selection (stays single scope)', () => {
    expect(toggleScopeSelection({ scope: null, filter: [] }, 's1', true)).toEqual({
      scope: 's1',
      filter: []
    })
  })

  it('cmd-click removing down to one collapses back to single scope', () => {
    expect(toggleScopeSelection({ scope: 's1', filter: ['s1', 's2'] }, 's2', true)).toEqual({
      scope: 's1',
      filter: []
    })
  })

  it('cmd-click removing the primary promotes the surviving member', () => {
    expect(toggleScopeSelection({ scope: 's1', filter: ['s1', 's2', 's3'] }, 's1', true)).toEqual({
      scope: 's2',
      filter: ['s2', 's3']
    })
  })

  it('keeps the primary when it survives a toggle', () => {
    expect(toggleScopeSelection({ scope: 's2', filter: ['s1', 's2'] }, 's3', true)).toEqual({
      scope: 's2',
      filter: ['s1', 's2', 's3']
    })
  })
})
