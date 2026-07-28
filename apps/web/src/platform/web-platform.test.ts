/**
 * The web host's NavTarget → route mapping (exploration 0406).
 *
 * This is the seam the desktop shell will implement differently, so the
 * mapping is worth pinning: a node type with no route used to navigate
 * nowhere, silently — the failure mode 0353 called out for the history chords.
 */

import { describe, expect, it } from 'vitest'
import { TAB_NODE_TYPES } from '../workbench/state'
import { routeForTarget } from './web-platform'

describe('routeForTarget', () => {
  it('resolves every TabNodeType — none may navigate nowhere', () => {
    for (const nodeType of TAB_NODE_TYPES) {
      const route = routeForTarget({ kind: 'node', nodeType, nodeId: 'abc' })
      expect(route, `no route for node type ${nodeType}`).not.toBeNull()
      expect(route?.to.startsWith('/')).toBe(true)
    }
  })

  it('substitutes the id into parameterised routes', () => {
    expect(routeForTarget({ kind: 'node', nodeType: 'page', nodeId: 'doc-1' })).toEqual({
      to: '/doc/$docId',
      params: { docId: 'doc-1' }
    })
  })

  it('omits params for singleton surfaces', () => {
    expect(routeForTarget({ kind: 'node', nodeType: 'tasks', nodeId: 'ignored' })).toEqual({
      to: '/tasks'
    })
  })

  it('maps home and raw paths', () => {
    expect(routeForTarget({ kind: 'home' })).toEqual({ to: '/' })
    expect(routeForTarget({ kind: 'path', path: '/requests' })).toEqual({ to: '/requests' })
  })

  it('resolves a surface by its stable id', () => {
    expect(routeForTarget({ kind: 'surface', surfaceId: 'tasks' })?.to).toBe('/tasks')
  })

  it('returns null for an unknown surface rather than guessing a path', () => {
    expect(routeForTarget({ kind: 'surface', surfaceId: 'nope' })).toBeNull()
  })
})
