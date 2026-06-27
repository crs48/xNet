/**
 * Charter §Exit receipt (exploration 0234): leaving takes everything and loses
 * nothing, and Delete Day actually stops feeding the system without leaking who
 * you are.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  LEAVE_README,
  deleteDay,
  leaveWithEverything,
  type RightToLeavePorts
} from '../services/right-to-leave'

function ports(overrides: Partial<RightToLeavePorts> = {}): RightToLeavePorts {
  return {
    exportWorkspace: async () => ({ 'pages/hello.md': '# hello\n', 'manifest.jsonl': '{}\n' }),
    exportIdentity: async () => ({ did: 'did:key:zABC', recovery: 'seed' }),
    ...overrides
  }
}

describe('Charter §Exit — leaveWithEverything', () => {
  it('bundles the whole workspace, the identity, and a how-to README', async () => {
    const bundle = await leaveWithEverything(ports(), { now: '2026-06-27T00:00:00.000Z' })

    expect(bundle.exportedAt).toBe('2026-06-27T00:00:00.000Z')
    expect(Object.keys(bundle.files).sort()).toEqual([
      'README.md',
      'identity.did.json',
      'workspace/manifest.jsonl',
      'workspace/pages/hello.md'
    ])
    expect(bundle.files['workspace/pages/hello.md']).toBe('# hello\n')
    expect(JSON.parse(bundle.files['identity.did.json'])).toMatchObject({ did: 'did:key:zABC' })
    expect(bundle.files['README.md']).toBe(LEAVE_README)
  })

  it('the README explains re-import and never confirmshames', () => {
    expect(LEAVE_README).toMatch(/xnet-hub start/)
    expect(LEAVE_README).toMatch(/works on any hub/)
    expect(LEAVE_README.toLowerCase()).not.toContain('are you sure')
  })
})

describe('Charter §Exit — deleteDay', () => {
  it('full wipe: purges remote, destroys local, records only an anonymous signal', async () => {
    const purgeRemoteCopies = vi.fn(async () => {})
    const destroyLocal = vi.fn(async () => {})
    const recordLeft = vi.fn(() => {})

    const result = await deleteDay(ports({ purgeRemoteCopies, destroyLocal, recordLeft }), {
      keepLocal: false,
      now: '2026-06-27T00:00:00.000Z'
    })

    expect(result).toEqual({ remotePurged: true, localWiped: true, recordedLeft: true })
    expect(purgeRemoteCopies).toHaveBeenCalledOnce()
    expect(destroyLocal).toHaveBeenCalledOnce()
    // The "account.left" signal takes no arguments — it cannot carry identity.
    expect(recordLeft).toHaveBeenCalledWith()
  })

  it('export-and-go: keepLocal preserves the local master copy', async () => {
    const destroyLocal = vi.fn(async () => {})
    const result = await deleteDay(ports({ purgeRemoteCopies: async () => {}, destroyLocal }), {
      keepLocal: true,
      now: '2026-06-27T00:00:00.000Z'
    })

    expect(result.localWiped).toBe(false)
    expect(destroyLocal).not.toHaveBeenCalled()
  })

  it('offline-only user (no hub, no local destroy) leaves cleanly without error', async () => {
    const result = await deleteDay(ports(), { keepLocal: false, now: '2026-06-27T00:00:00.000Z' })
    expect(result).toEqual({ remotePurged: false, localWiped: false, recordedLeft: false })
  })
})
