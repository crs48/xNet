import { describe, expect, it } from 'vitest'
import {
  createCanvasStoragePolicyDecision,
  getCanvasStoragePolicies,
  getCanvasStoragePolicyCapability,
  isCanvasStoragePolicy,
  normalizeCanvasStoragePolicy
} from '../storage-policy'

describe('canvas storage policy model', () => {
  it('should expose the canonical storage policy order', () => {
    expect(getCanvasStoragePolicies()).toEqual([
      'reference-only',
      'copied-blob',
      'synced-blob',
      'remote-only',
      'blocked'
    ])
  })

  it('should describe bytes, sync, preview, and collaboration behavior', () => {
    expect(getCanvasStoragePolicyCapability('reference-only')).toMatchObject({
      storesReference: true,
      copiesBytes: false,
      syncsBytes: false,
      availableToCollaborators: false,
      availableOfflineOnCurrentDevice: true,
      allowsPreview: true,
      disabled: false
    })

    expect(getCanvasStoragePolicyCapability('copied-blob')).toMatchObject({
      copiesBytes: true,
      syncsBytes: false,
      availableToCollaborators: false,
      requiresConsent: true
    })

    expect(getCanvasStoragePolicyCapability('synced-blob')).toMatchObject({
      copiesBytes: true,
      syncsBytes: true,
      availableToCollaborators: true,
      requiresConsent: true
    })

    expect(getCanvasStoragePolicyCapability('remote-only')).toMatchObject({
      storesReference: true,
      copiesBytes: false,
      availableToCollaborators: true,
      availableOfflineOnCurrentDevice: false
    })

    expect(getCanvasStoragePolicyCapability('blocked')).toMatchObject({
      storesReference: false,
      copiesBytes: false,
      syncsBytes: false,
      allowsPreview: false,
      disabled: true
    })
  })

  it('should normalize untrusted policy values', () => {
    expect(isCanvasStoragePolicy('synced-blob')).toBe(true)
    expect(isCanvasStoragePolicy('managed-folder')).toBe(false)
    expect(normalizeCanvasStoragePolicy('remote-only')).toBe('remote-only')
    expect(normalizeCanvasStoragePolicy('managed-folder')).toBe('reference-only')
    expect(normalizeCanvasStoragePolicy('managed-folder', 'blocked')).toBe('blocked')
  })

  it('should create durable policy decisions with local-file defaults', () => {
    expect(
      createCanvasStoragePolicyDecision({
        policy: 'blocked',
        reason: 'Executable files cannot be previewed',
        contentHash: 'hash-1',
        sizeBytes: 42
      })
    ).toEqual({
      policy: 'blocked',
      sourceKind: 'local-file',
      reason: 'Executable files cannot be previewed',
      contentHash: 'hash-1',
      sizeBytes: 42
    })

    expect(
      createCanvasStoragePolicyDecision({
        policy: 'remote-only',
        sourceKind: 'remote-url'
      })
    ).toEqual({
      policy: 'remote-only',
      sourceKind: 'remote-url'
    })
  })
})
