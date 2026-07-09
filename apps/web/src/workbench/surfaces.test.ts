/**
 * Floating shell surfaces model + store actions (exploration 0286).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbench } from './state'
import { DEFAULT_SURFACE, SURFACES, pinnedSurfaces, surfaceById } from './surfaces'

beforeEach(() => {
  useWorkbench.setState({
    activeSurface: 'explorer',
    navPinned: ['explorer', 'requests', 'tasks'],
    sidebarWidth: 264,
    sidebarCompact: false,
    floatAi: true,
    floatCall: false
  })
})

describe('surfaces model', () => {
  it('exposes the default-pinned surfaces and a panel default', () => {
    expect(surfaceById(DEFAULT_SURFACE)?.kind).toBe('panel')
    for (const id of ['explorer', 'requests', 'tasks']) {
      expect(surfaceById(id)).toBeDefined()
    }
  })

  it('resolves pinned ids to defs in order, dropping unknowns', () => {
    const resolved = pinnedSurfaces(['tasks', 'nope', 'explorer'])
    expect(resolved.map((s) => s.id)).toEqual(['tasks', 'explorer'])
  })

  it('every panel surface names a slot view; every route names a path', () => {
    for (const surface of SURFACES) {
      if (surface.kind === 'panel') expect(surface.viewId).toBeTruthy()
      else expect(surface.to).toBeTruthy()
    }
  })
})

describe('floating shell store', () => {
  it('sets the active surface', () => {
    useWorkbench.getState().setActiveSurface('tasks')
    expect(useWorkbench.getState().activeSurface).toBe('tasks')
  })

  it('pins and unpins surfaces', () => {
    useWorkbench.getState().toggleNavPinned('data')
    expect(useWorkbench.getState().navPinned).toContain('data')
    useWorkbench.getState().toggleNavPinned('data')
    expect(useWorkbench.getState().navPinned).not.toContain('data')
  })

  it('clamps the sidebar width to 230–320', () => {
    useWorkbench.getState().setSidebarWidth(999)
    expect(useWorkbench.getState().sidebarWidth).toBe(320)
    useWorkbench.getState().setSidebarWidth(10)
    expect(useWorkbench.getState().sidebarWidth).toBe(230)
  })

  it('toggles the floating dock islands', () => {
    useWorkbench.getState().setFloatAi(false)
    useWorkbench.getState().setFloatCall(true)
    expect(useWorkbench.getState().floatAi).toBe(false)
    expect(useWorkbench.getState().floatCall).toBe(true)
  })

  it('collapses/expands the header island', () => {
    expect(useWorkbench.getState().sidebarCompact).toBe(false)
    useWorkbench.getState().toggleSidebarCompact()
    expect(useWorkbench.getState().sidebarCompact).toBe(true)
    useWorkbench.getState().toggleSidebarCompact()
    expect(useWorkbench.getState().sidebarCompact).toBe(false)
  })
})
