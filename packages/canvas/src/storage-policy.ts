/**
 * Storage policy model for source-backed canvas objects.
 */

export type CanvasStoragePolicy =
  | 'reference-only'
  | 'copied-blob'
  | 'synced-blob'
  | 'remote-only'
  | 'blocked'

export type CanvasStorageSourceKind =
  | 'local-file'
  | 'directory-entry'
  | 'remote-url'
  | 'clipboard'
  | 'generated'
  | 'plugin'

export type CanvasStoragePolicyCapability = {
  policy: CanvasStoragePolicy
  label: string
  description: string
  storesReference: boolean
  copiesBytes: boolean
  syncsBytes: boolean
  availableToCollaborators: boolean
  availableOfflineOnCurrentDevice: boolean
  requiresConsent: boolean
  allowsPreview: boolean
  disabled: boolean
}

export type CanvasStoragePolicyDecision = {
  policy: CanvasStoragePolicy
  sourceKind: CanvasStorageSourceKind
  reason?: string
  contentHash?: string
  sizeBytes?: number
}

export type CreateCanvasStoragePolicyDecisionInput = Omit<
  CanvasStoragePolicyDecision,
  'sourceKind'
> &
  Partial<Pick<CanvasStoragePolicyDecision, 'sourceKind'>>

const CANVAS_STORAGE_POLICIES: readonly CanvasStoragePolicy[] = [
  'reference-only',
  'copied-blob',
  'synced-blob',
  'remote-only',
  'blocked'
]

const CANVAS_STORAGE_POLICY_CAPABILITIES: Readonly<
  Record<CanvasStoragePolicy, CanvasStoragePolicyCapability>
> = {
  'reference-only': {
    policy: 'reference-only',
    label: 'Reference only',
    description: 'Keep a durable local or external reference without copying file bytes.',
    storesReference: true,
    copiesBytes: false,
    syncsBytes: false,
    availableToCollaborators: false,
    availableOfflineOnCurrentDevice: true,
    requiresConsent: false,
    allowsPreview: true,
    disabled: false
  },
  'copied-blob': {
    policy: 'copied-blob',
    label: 'Copied blob',
    description: 'Copy bytes into local xNet blob storage without syncing the bytes.',
    storesReference: true,
    copiesBytes: true,
    syncsBytes: false,
    availableToCollaborators: false,
    availableOfflineOnCurrentDevice: true,
    requiresConsent: true,
    allowsPreview: true,
    disabled: false
  },
  'synced-blob': {
    policy: 'synced-blob',
    label: 'Synced blob',
    description: 'Copy bytes into xNet blob storage and sync them according to workspace policy.',
    storesReference: true,
    copiesBytes: true,
    syncsBytes: true,
    availableToCollaborators: true,
    availableOfflineOnCurrentDevice: true,
    requiresConsent: true,
    allowsPreview: true,
    disabled: false
  },
  'remote-only': {
    policy: 'remote-only',
    label: 'Remote only',
    description: 'Store a remote URL and cache metadata without copying source bytes.',
    storesReference: true,
    copiesBytes: false,
    syncsBytes: false,
    availableToCollaborators: true,
    availableOfflineOnCurrentDevice: false,
    requiresConsent: false,
    allowsPreview: true,
    disabled: false
  },
  blocked: {
    policy: 'blocked',
    label: 'Blocked',
    description: 'Block storage and preview because the source is unsafe or unauthorized.',
    storesReference: false,
    copiesBytes: false,
    syncsBytes: false,
    availableToCollaborators: false,
    availableOfflineOnCurrentDevice: false,
    requiresConsent: false,
    allowsPreview: false,
    disabled: true
  }
}

export function getCanvasStoragePolicies(): CanvasStoragePolicy[] {
  return [...CANVAS_STORAGE_POLICIES]
}

export function isCanvasStoragePolicy(value: unknown): value is CanvasStoragePolicy {
  return typeof value === 'string' && CANVAS_STORAGE_POLICIES.includes(value as CanvasStoragePolicy)
}

export function normalizeCanvasStoragePolicy(
  value: unknown,
  fallback: CanvasStoragePolicy = 'reference-only'
): CanvasStoragePolicy {
  return isCanvasStoragePolicy(value) ? value : fallback
}

export function getCanvasStoragePolicyCapability(
  policy: CanvasStoragePolicy
): CanvasStoragePolicyCapability {
  return CANVAS_STORAGE_POLICY_CAPABILITIES[policy]
}

export function createCanvasStoragePolicyDecision(
  input: CreateCanvasStoragePolicyDecisionInput
): CanvasStoragePolicyDecision {
  return {
    ...input,
    sourceKind: input.sourceKind ?? 'local-file'
  }
}
