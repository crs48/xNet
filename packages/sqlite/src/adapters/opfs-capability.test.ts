import { describe, expect, it } from 'vitest'
import {
  detectOpfsCapability,
  isCrossOriginIsolated,
  supportsOpfs,
  supportsSyncAccessHandle,
  type OpfsCapabilityScope
} from './opfs-capability'

// Synthetic scopes — the `unit` pool shares globals (isolate: false), so we
// inject rather than mutate. These mirror the real engine matrix.
const modernChrome: OpfsCapabilityScope = {
  navigator: { storage: { getDirectory: () => Promise.resolve({}) } },
  FileSystemSyncAccessHandle: function () {},
  SharedArrayBuffer: function () {},
  crossOriginIsolated: true
}

const oldIos: OpfsCapabilityScope = {
  // iOS 15.2–16.3: OPFS exists, but no sync access handles.
  navigator: { storage: { getDirectory: () => Promise.resolve({}) } }
}

const iosViaPrototype: OpfsCapabilityScope = {
  navigator: { storage: { getDirectory: () => Promise.resolve({}) } },
  FileSystemFileHandle: { prototype: { createSyncAccessHandle: () => {} } }
}

const noOpfs: OpfsCapabilityScope = {
  navigator: { storage: {} }
}

describe('OPFS capability detection', () => {
  it('detects the full fast path on a modern cross-origin-isolated engine', () => {
    const cap = detectOpfsCapability(modernChrome)
    expect(cap.opfs).toBe(true)
    expect(cap.syncAccessHandle).toBe(true)
    expect(cap.crossOriginIsolated).toBe(true)
    expect(cap.mode).toBe('sync-access-handle')
  })

  it('falls back to async OPFS on iOS without sync access handles', () => {
    const cap = detectOpfsCapability(oldIos)
    expect(cap.opfs).toBe(true)
    expect(cap.syncAccessHandle).toBe(false)
    expect(cap.mode).toBe('async-opfs')
    expect(cap.reason).toMatch(/async OPFS/i)
  })

  it('accepts createSyncAccessHandle exposed on the file-handle prototype', () => {
    expect(supportsSyncAccessHandle(iosViaPrototype)).toBe(true)
    expect(detectOpfsCapability(iosViaPrototype).mode).toBe('sync-access-handle')
  })

  it('reports memory mode when OPFS is entirely absent', () => {
    const cap = detectOpfsCapability(noOpfs)
    expect(supportsOpfs(noOpfs)).toBe(false)
    expect(cap.mode).toBe('memory')
    expect(cap.reason).toMatch(/will not persist/i)
  })

  it('only treats SharedArrayBuffer as usable when cross-origin isolated', () => {
    expect(isCrossOriginIsolated(modernChrome)).toBe(true)
    expect(
      isCrossOriginIsolated({ SharedArrayBuffer: function () {}, crossOriginIsolated: false })
    ).toBe(false)
    expect(isCrossOriginIsolated({ crossOriginIsolated: true })).toBe(false)
  })

  it('defaults to the real global scope without throwing', () => {
    // In the node `unit` pool none of these globals exist → memory mode.
    expect(() => detectOpfsCapability()).not.toThrow()
    expect(detectOpfsCapability().opfs).toBe(false)
  })
})
