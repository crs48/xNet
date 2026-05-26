import { describe, expect, it } from 'vitest'
import {
  createCanvasStoragePolicyDecision,
  createCanvasStoragePolicyPrompt,
  getCanvasBlockedPreviewReason,
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

  it('should create local file consent prompts for local-only, copied, and synced choices', () => {
    const prompt = createCanvasStoragePolicyPrompt({
      sourceKind: 'local-file',
      fileName: 'planning.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      workspaceCanSyncBytes: false
    })

    expect(prompt).toMatchObject({
      intent: 'local-file-ingestion',
      title: 'Choose how to add this file',
      sourceLabel: 'planning.pdf',
      defaultPolicy: 'reference-only'
    })
    expect(prompt.options.map((option) => option.policy)).toEqual([
      'reference-only',
      'copied-blob',
      'synced-blob'
    ])
    expect(prompt.options[0]).toMatchObject({
      label: 'Keep local-only',
      recommended: true,
      copiesBytes: false,
      syncsBytes: false
    })
    expect(prompt.options[1]).toMatchObject({
      requiresConsent: true,
      copiesBytes: true,
      syncsBytes: false,
      consentLabel: 'Copy file bytes to this device'
    })
    expect(prompt.options[2]).toMatchObject({
      requiresConsent: true,
      copiesBytes: true,
      syncsBytes: true,
      disabled: true,
      disabledReason: 'Workspace policy does not currently allow syncing file bytes.'
    })
  })

  it('should create remote and blocked storage prompts', () => {
    expect(
      createCanvasStoragePolicyPrompt({
        sourceKind: 'remote-url',
        url: 'https://example.com/report.pdf'
      })
    ).toMatchObject({
      intent: 'remote-reference',
      defaultPolicy: 'remote-only',
      options: [
        expect.objectContaining({
          policy: 'remote-only',
          recommended: true
        })
      ]
    })

    expect(
      createCanvasStoragePolicyPrompt({
        sourceKind: 'local-file',
        fileName: 'installer.exe',
        blockedReason: 'Executable files cannot be previewed.'
      })
    ).toMatchObject({
      intent: 'blocked-source',
      defaultPolicy: 'blocked',
      options: [
        expect.objectContaining({
          policy: 'blocked',
          disabled: true,
          allowsPreview: false,
          recommended: true
        })
      ]
    })
  })

  it('should block active preview types before storage choices are offered', () => {
    expect(
      getCanvasBlockedPreviewReason({
        fileName: 'installer.exe',
        mimeType: 'application/octet-stream'
      })
    ).toContain("extension '.exe'")
    expect(
      getCanvasBlockedPreviewReason({
        fileName: 'preview.svg',
        mimeType: 'image/svg+xml'
      })
    ).toContain("MIME type 'image/svg+xml'")
    expect(
      getCanvasBlockedPreviewReason({
        fileName: 'brief.doc',
        mimeType: 'application/msword'
      })
    ).toBeNull()
    expect(
      getCanvasBlockedPreviewReason({
        fileName: 'photo.png',
        mimeType: 'image/png'
      })
    ).toBeNull()

    expect(
      createCanvasStoragePolicyPrompt({
        sourceKind: 'local-file',
        fileName: 'widget.html',
        mimeType: 'text/html'
      })
    ).toMatchObject({
      intent: 'blocked-source',
      defaultPolicy: 'blocked',
      options: [
        expect.objectContaining({
          policy: 'blocked',
          allowsPreview: false
        })
      ]
    })
  })

  it('should keep local-only file cards from syncing bytes without consent', () => {
    const localOnly = getCanvasStoragePolicyCapability('reference-only')
    const copied = getCanvasStoragePolicyCapability('copied-blob')
    const synced = getCanvasStoragePolicyCapability('synced-blob')

    expect(localOnly).toMatchObject({
      storesReference: true,
      copiesBytes: false,
      syncsBytes: false,
      requiresConsent: false
    })
    expect(copied).toMatchObject({
      copiesBytes: true,
      syncsBytes: false,
      requiresConsent: true
    })
    expect(synced).toMatchObject({
      copiesBytes: true,
      syncsBytes: true,
      requiresConsent: true
    })
  })
})
