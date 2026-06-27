/**
 * Charter §Exit receipt: the leave ports export the portable identity, route
 * destroy/record to injected deps, and the bundle downloads as one dated file.
 * (The IndexedDB workspace dump runs in-app; the leave *policy* is unit-tested
 * in @xnetjs/plugins.)
 */
import type { LeaveBundle } from '@xnetjs/plugins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLeavePorts, downloadLeaveBundle, type LeaveDeps } from './leave'

const noopDeps: LeaveDeps = { destroyLocal: () => {}, recordLeft: () => {} }

describe('createLeavePorts (Charter §Exit)', () => {
  it('exports the portable did:key identity', async () => {
    const ports = createLeavePorts({ did: 'did:key:zABC' }, 'now', noopDeps)
    expect(await ports.exportIdentity()).toEqual({ did: 'did:key:zABC' })
  })

  it('reports a null did when none is set (offline-only departure)', async () => {
    const ports = createLeavePorts({}, 'now', noopDeps)
    expect(await ports.exportIdentity()).toEqual({ did: null })
  })

  it('routes destroy + record to the injected deps; no hub purge yet', async () => {
    const deps = { destroyLocal: vi.fn(), recordLeft: vi.fn() }
    const ports = createLeavePorts({ did: 'x' }, 'now', deps)

    await ports.destroyLocal?.()
    ports.recordLeft?.()

    expect(deps.destroyLocal).toHaveBeenCalledOnce()
    expect(deps.recordLeft).toHaveBeenCalledOnce()
    expect(ports.purgeRemoteCopies).toBeUndefined()
  })
})

describe('downloadLeaveBundle', () => {
  beforeEach(() => {
    // jsdom lacks URL.createObjectURL — stub the download plumbing.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })
  afterEach(() => vi.restoreAllMocks())

  it('downloads the whole bundle as one dated file', () => {
    const anchor = document.createElement('a')
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(document.body, 'appendChild').mockReturnValue(anchor)
    vi.spyOn(document.body, 'removeChild').mockReturnValue(anchor)
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})

    const bundle: LeaveBundle = {
      files: { 'README.md': 'hi', 'workspace.json': '{}' },
      exportedAt: '2026-06-27T12:00:00.000Z'
    }
    downloadLeaveBundle(bundle)

    expect(click).toHaveBeenCalledOnce()
    expect(anchor.download).toBe('xnet-everything-2026-06-27.json')
  })
})
