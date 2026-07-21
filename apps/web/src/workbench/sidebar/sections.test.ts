/**
 * The nav's one rule (exploration 0388).
 *
 * Every primary row changes the main area. Before this guard, five of eleven
 * sections were `kind: 'lens'` and only re-filtered the sidebar — clicks that
 * were indistinguishable from a broken button, and a regression (People lost
 * its `/crm` destination) that no test noticed.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECTIONS,
  isSectionActive,
  lensForRoute,
  resolveSections,
  sectionDestination,
  type SidebarSection
} from './sections'
import { sidebarRegistry } from './registry'
import { registerBuiltinSidebarSources } from './sources'

registerBuiltinSidebarSources()

const lensRoute = (lensId: string): string | undefined => sidebarRegistry.getLens(lensId)?.route

describe('section destinations', () => {
  it('resolves a destination for every default section', () => {
    for (const section of DEFAULT_SECTIONS) {
      expect(
        sectionDestination(section, lensRoute),
        `section "${section.id}" has no destination — it would be a dead click`
      ).toBeTruthy()
    }
  })

  it('recovers the destinations the 0353 rewrite dropped', () => {
    expect(lensRoute('people')).toBe('/crm')
    expect(lensRoute('views')).toBe('/data')
  })

  it('sends the three home lenses to /', () => {
    for (const id of ['all', 'docs', 'chats']) expect(lensRoute(id)).toBe('/')
  })
})

describe('isSectionActive', () => {
  const byId = (id: string): SidebarSection =>
    DEFAULT_SECTIONS.find((section) => section.id === id)!
  const active = (id: string, pathname: string, activeLensId: string): boolean =>
    isSectionActive({ section: byId(id), pathname, activeLensId, lensRoute })

  it('lights exactly one section per location', () => {
    const locations: Array<[string, string]> = [
      ['/', 'docs'],
      ['/', 'chats'],
      ['/crm', 'people'],
      ['/data', 'views'],
      ['/requests', 'all'],
      ['/ai', 'all'],
      ['/meetings', 'views']
    ]
    for (const [pathname, activeLensId] of locations) {
      const lit = DEFAULT_SECTIONS.filter((section) =>
        isSectionActive({ section, pathname, activeLensId, lensRoute })
      )
      expect(lit.map((s) => s.id), `at ${pathname} (lens ${activeLensId})`).toHaveLength(1)
    }
  })

  it('distinguishes the lenses that share /', () => {
    expect(active('docs', '/', 'docs')).toBe(true)
    expect(active('chats', '/', 'docs')).toBe(false)
    expect(active('all', '/', 'docs')).toBe(false)
  })

  it('lights People on /crm regardless of the stored lens', () => {
    // The route is the source of truth, so a stale persisted lens can't leave
    // the sidebar disagreeing with the main area.
    expect(active('people', '/crm', 'all')).toBe(true)
    expect(active('docs', '/crm', 'docs')).toBe(false)
  })

  it('does not light a lens section for a route it does not own', () => {
    expect(active('views', '/meetings', 'views')).toBe(false)
    expect(active('meetings', '/meetings', 'views')).toBe(true)
  })

  it('matches nested paths under a route section', () => {
    expect(active('tasks', '/tasks/abc', 'all')).toBe(true)
  })
})

describe('lensForRoute', () => {
  it('restores the lens a route exclusively owns', () => {
    expect(lensForRoute('/crm', lensRoute)).toBe('people')
    expect(lensForRoute('/data', lensRoute)).toBe('views')
  })

  it('leaves shared and unrelated routes alone', () => {
    // '/' is home for three lenses, so arriving there must not reset the
    // user's choice; '/meetings' belongs to no lens at all.
    expect(lensForRoute('/', lensRoute)).toBeUndefined()
    expect(lensForRoute('/meetings', lensRoute)).toBeUndefined()
  })
})

describe('resolveSections', () => {
  it('drops unknown persisted ids and appends new defaults', () => {
    const resolved = resolveSections(['views', 'nope', 'docs'])
    expect(resolved.slice(0, 2).map((s) => s.id)).toEqual(['views', 'docs'])
    expect(resolved.map((s) => s.id)).toContain('inbox')
    expect(resolved.map((s) => s.id)).not.toContain('nope')
  })

  it('omits Analytics unless the telemetry dashboard is compiled in', () => {
    // A row that always dead-ends teaches people the nav lies.
    expect(resolveSections([]).map((s) => s.id)).not.toContain('analytics')
  })
})
