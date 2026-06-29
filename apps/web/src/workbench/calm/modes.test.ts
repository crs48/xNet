/**
 * Route → mode table tests (exploration 0250). The mapping must be total and
 * stable: every real route resolves to a mode (or modeless), and each mode has
 * a reachable home.
 */
import { describe, expect, it } from 'vitest'
import { CALM_MODES, homeForMode, modeForPath } from './modes'

describe('modeForPath', () => {
  it('routes content surfaces to Workspace', () => {
    for (const path of [
      '/',
      '/doc/abc',
      '/db/xyz',
      '/canvas/c1',
      '/dashboard/d1',
      '/map/m1',
      '/view/v1',
      '/tasks',
      '/data',
      '/experiments',
      '/finance',
      '/lab/l1',
      '/space/s1',
      '/tag/t1',
      '/stories'
    ]) {
      expect(modeForPath(path)).toBe('workspace')
    }
  })

  it('routes people + social surfaces to Network', () => {
    for (const path of [
      '/discover',
      '/requests',
      '/crm',
      '/person/did:key:z123',
      '/channel/general',
      '/social-import'
    ]) {
      expect(modeForPath(path)).toBe('network')
    }
  })

  it('routes the agent surface to Companion', () => {
    expect(modeForPath('/companion')).toBe('companion')
    expect(modeForPath('/companion/thread-1')).toBe('companion')
  })

  it('treats settings/analytics/share/welcome as modeless', () => {
    for (const path of ['/settings', '/analytics', '/welcome', '/share']) {
      expect(modeForPath(path)).toBeNull()
    }
  })

  it('matches on path segments, not bare prefixes', () => {
    // `/data` is Workspace, but a hypothetical `/database-foo` must not be
    // swallowed by the `/data` owner — segment-boundary matching guards this.
    expect(modeForPath('/dataset')).toBe('workspace')
    // `/personalize` must not be mistaken for the `/person` Network owner.
    expect(modeForPath('/personalize')).toBe('workspace')
  })
})

describe('homeForMode', () => {
  it('gives every mode a reachable home', () => {
    expect(homeForMode('companion')).toBe('/companion')
    expect(homeForMode('workspace')).toBe('/')
    expect(homeForMode('network')).toBe('/discover')
  })

  it('each mode home resolves back to that mode (round-trip)', () => {
    for (const def of CALM_MODES) {
      expect(modeForPath(def.home)).toBe(def.id)
    }
  })
})
