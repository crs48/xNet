/**
 * The desktop PlatformPort's two pure halves (exploration 0406):
 * shell state → synthesized pathname, and nav intent → shell action.
 *
 * The pathname grammar mirrors web's routes on purpose — shared core modules
 * (`tabFromPathname`, route titles) must behave identically on both hosts.
 */

import type { NavTarget } from '@xnetjs/workbench'
import { describe, expect, it, vi } from 'vitest'
import { navigateShell, pathnameForShellState, type DesktopNavDeps } from './desktop-platform'

function makeDeps(): DesktopNavDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    shellState: { kind: 'canvas-home' },
    returnHome: () => void calls.push('shell:return-home'),
    openDocument: (id) => void calls.push(`doc:${id}`),
    openAssistant: () => void calls.push('assistant'),
    openSettings: () => void calls.push('settings'),
    openMeetings: () => void calls.push('meetings'),
    openDataWorkspace: () => void calls.push('data')
  }
}

describe('pathnameForShellState', () => {
  it('mirrors the web route grammar for every shell kind', () => {
    expect(pathnameForShellState({ kind: 'canvas-home' })).toBe('/')
    expect(pathnameForShellState({ kind: 'page-focus', docId: 'p1', returnViewport: null })).toBe(
      '/doc/p1'
    )
    expect(
      pathnameForShellState({ kind: 'database-focus', docId: 'd1', returnViewport: null })
    ).toBe('/db/d1')
    expect(pathnameForShellState({ kind: 'database-split', docId: 'd2' })).toBe('/db/d2')
    expect(pathnameForShellState({ kind: 'settings' })).toBe('/settings')
    expect(pathnameForShellState({ kind: 'data-workspace' })).toBe('/data')
    expect(pathnameForShellState({ kind: 'assistant' })).toBe('/ai')
  })

  it('encodes doc ids the way web routes do (seeded ids contain slashes)', () => {
    expect(
      pathnameForShellState({ kind: 'page-focus', docId: 'default/spec', returnViewport: null })
    ).toBe('/doc/default%2Fspec')
  })
})

describe('navigateShell', () => {
  it('routes node intents through the shell handlers', () => {
    const deps = makeDeps()
    navigateShell({ kind: 'node', nodeType: 'page', nodeId: 'p1' }, deps)
    navigateShell({ kind: 'node', nodeType: 'settings', nodeId: '' }, deps)
    navigateShell({ kind: 'home' }, deps)
    expect(deps.calls).toEqual(['doc:p1', 'settings', 'shell:return-home'])
  })

  it('maps the path escape hatch onto desktop surfaces', () => {
    const deps = makeDeps()
    navigateShell({ kind: 'path', path: '/ai' }, deps)
    navigateShell({ kind: 'path', path: '/data' }, deps)
    expect(deps.calls).toEqual(['assistant', 'data'])
  })

  it('returns false for targets this host has no surface for — never a silent no-op', () => {
    const deps = makeDeps()
    const unhandled: NavTarget[] = [
      { kind: 'node', nodeType: 'crm', nodeId: '' },
      { kind: 'path', path: '/requests' },
      { kind: 'surface', surfaceId: 'discover' }
    ]
    for (const target of unhandled) {
      expect(navigateShell(target, deps), JSON.stringify(target)).toBe(false)
    }
    expect(deps.calls).toEqual([])
  })

  it('handles every TabNodeType without throwing (exhaustive dispatch)', () => {
    const deps = makeDeps()
    const spy = vi.fn()
    // Types desktop cannot open return false; none may throw.
    for (const nodeType of ['post', 'dashboard', 'map', 'savedview', 'tag', 'channel'] as const) {
      expect(() => spy(navigateShell({ kind: 'node', nodeType, nodeId: 'x' }, deps))).not.toThrow()
    }
  })
})
