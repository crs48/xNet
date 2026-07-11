/**
 * Floating shell surfaces model + store actions (exploration 0286).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbench } from './state'
import {
  DEFAULT_SURFACE,
  SURFACES,
  activateSurface,
  pinnedSurfaces,
  surfaceById,
  surfaceTabId,
  type SurfaceDef
} from './surfaces'
import { consumePreviewIntent, setPreviewIntent } from './tabs'

const surface = (id: string): SurfaceDef => {
  const def = surfaceById(id)
  if (!def) throw new Error(`unknown surface ${id}`)
  return def
}

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
    for (const def of SURFACES) {
      if (def.kind === 'panel') expect(def.viewId).toBeTruthy()
      else expect(def.to).toBeTruthy()
    }
  })
})

describe('surfaceTabId', () => {
  it('resolves the tab id for tab-backed route surfaces', () => {
    expect(surfaceTabId(surface('crm'))).toBe('crm:crm')
    expect(surfaceTabId(surface('meetings'))).toBe('meetings:meetings')
    expect(surfaceTabId(surface('finance'))).toBe('finance:finance')
  })

  it('resolves the tab id for a panel surface with a companion route', () => {
    expect(surfaceTabId(surface('tasks'))).toBe('tasks:tasks')
  })

  it('is null for routeless panels and non-tab routes', () => {
    expect(surfaceTabId(surface('explorer'))).toBeNull() // panel
    expect(surfaceTabId(surface('discover'))).toBeNull() // route, but untabbed
    expect(surfaceTabId(surface('analytics'))).toBeNull()
  })
})

describe('activateSurface (VS Code preview tabs, 0288)', () => {
  beforeEach(() => {
    consumePreviewIntent() // clear residue between cases
  })

  it('opens a tab-backed route as a preview tab', () => {
    const calls: Array<{ to: string }> = []
    activateSurface(surface('crm'), {
      navigate: (opts) => calls.push(opts),
      setActiveSurface: () => expect.unreachable('route surfaces do not touch the panel')
    })
    expect(calls).toEqual([{ to: '/crm' }])
    expect(consumePreviewIntent()).toBe(true)
  })

  it('does NOT arm preview for an untabbed route (would leak onto the next open)', () => {
    const calls: Array<{ to: string }> = []
    activateSurface(surface('discover'), {
      navigate: (opts) => calls.push(opts),
      setActiveSurface: () => expect.unreachable('route surfaces do not touch the panel')
    })
    expect(calls).toEqual([{ to: '/discover' }])
    expect(consumePreviewIntent()).toBe(false)
  })

  it('drives the bottom island for routeless panel surfaces without navigating or arming preview', () => {
    const activated: string[] = []
    activateSurface(surface('explorer'), {
      navigate: () => expect.unreachable('routeless panel surfaces do not navigate'),
      setActiveSurface: (id) => activated.push(id)
    })
    expect(activated).toEqual(['explorer'])
    expect(consumePreviewIntent()).toBe(false)
  })

  it('drives the bottom island AND opens the board for the Tasks panel surface', () => {
    const activated: string[] = []
    const calls: Array<{ to: string }> = []
    activateSurface(surface('tasks'), {
      navigate: (opts) => calls.push(opts),
      setActiveSurface: (id) => activated.push(id)
    })
    expect(activated).toEqual(['tasks'])
    expect(calls).toEqual([{ to: '/tasks' }])
    expect(consumePreviewIntent()).toBe(true) // /tasks is a singleton tab route
  })

  it('leaves the latch clean afterwards', () => {
    setPreviewIntent()
    expect(consumePreviewIntent()).toBe(true)
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
