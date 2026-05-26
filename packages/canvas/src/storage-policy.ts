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

export type CanvasStoragePolicyPromptIntent =
  | 'local-file-ingestion'
  | 'remote-reference'
  | 'blocked-source'

export type CanvasStoragePolicyPromptOption = CanvasStoragePolicyCapability & {
  recommended: boolean
  consentLabel?: string
  disabledReason?: string
}

export type CanvasStoragePolicyPrompt = {
  intent: CanvasStoragePolicyPromptIntent
  sourceKind: CanvasStorageSourceKind
  title: string
  description: string
  sourceLabel?: string
  mimeType?: string
  sizeBytes?: number
  defaultPolicy: CanvasStoragePolicy
  options: CanvasStoragePolicyPromptOption[]
}

export type CreateCanvasStoragePolicyDecisionInput = Omit<
  CanvasStoragePolicyDecision,
  'sourceKind'
> &
  Partial<Pick<CanvasStoragePolicyDecision, 'sourceKind'>>

export type CreateCanvasStoragePolicyPromptInput = {
  sourceKind: CanvasStorageSourceKind
  fileName?: string
  url?: string
  mimeType?: string
  sizeBytes?: number
  workspaceCanSyncBytes?: boolean
  blockedReason?: string
}

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

function createPromptOption(
  policy: CanvasStoragePolicy,
  input: {
    label?: string
    description?: string
    recommended?: boolean
    consentLabel?: string
    disabled?: boolean
    disabledReason?: string
  } = {}
): CanvasStoragePolicyPromptOption {
  const capability = getCanvasStoragePolicyCapability(policy)

  return {
    ...capability,
    label: input.label ?? capability.label,
    description: input.description ?? capability.description,
    recommended: input.recommended ?? false,
    consentLabel: input.consentLabel,
    disabled: input.disabled ?? capability.disabled,
    disabledReason: input.disabledReason
  }
}

function getStoragePromptSourceLabel(
  input: CreateCanvasStoragePolicyPromptInput
): string | undefined {
  return input.fileName ?? input.url
}

export function createCanvasStoragePolicyPrompt(
  input: CreateCanvasStoragePolicyPromptInput
): CanvasStoragePolicyPrompt {
  const sourceLabel = getStoragePromptSourceLabel(input)

  if (input.blockedReason) {
    return {
      intent: 'blocked-source',
      sourceKind: input.sourceKind,
      title: 'File blocked',
      description: input.blockedReason,
      sourceLabel,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      defaultPolicy: 'blocked',
      options: [
        createPromptOption('blocked', {
          recommended: true,
          description: input.blockedReason
        })
      ]
    }
  }

  if (input.sourceKind === 'remote-url') {
    return {
      intent: 'remote-reference',
      sourceKind: input.sourceKind,
      title: 'Add remote reference',
      description: 'Store the URL and preview metadata without copying source bytes.',
      sourceLabel,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      defaultPolicy: 'remote-only',
      options: [
        createPromptOption('remote-only', {
          recommended: true
        })
      ]
    }
  }

  const syncDisabled = input.workspaceCanSyncBytes === false

  return {
    intent: 'local-file-ingestion',
    sourceKind: input.sourceKind,
    title: 'Choose how to add this file',
    description:
      'Keep the file local-only, copy bytes into this workspace, or copy and sync bytes after consent.',
    sourceLabel,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    defaultPolicy: 'reference-only',
    options: [
      createPromptOption('reference-only', {
        label: 'Keep local-only',
        description: 'Reference the file on this device without copying or syncing its bytes.',
        recommended: true
      }),
      createPromptOption('copied-blob', {
        label: 'Copy to xNet',
        description: 'Copy bytes into local xNet storage for previews and offline access here.',
        consentLabel: 'Copy file bytes to this device'
      }),
      createPromptOption('synced-blob', {
        label: 'Copy and sync',
        description: 'Copy bytes into xNet storage and make them available to collaborators.',
        consentLabel: 'Copy and sync file bytes',
        disabled: syncDisabled,
        disabledReason: syncDisabled
          ? 'Workspace policy does not currently allow syncing file bytes.'
          : undefined
      })
    ]
  }
}

export function createCanvasStoragePolicyDecision(
  input: CreateCanvasStoragePolicyDecisionInput
): CanvasStoragePolicyDecision {
  return {
    ...input,
    sourceKind: input.sourceKind ?? 'local-file'
  }
}
