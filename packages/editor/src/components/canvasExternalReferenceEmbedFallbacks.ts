/**
 * Canvas external-reference embed fallback descriptors.
 */

import type {
  ExternalReferenceEmbedBlockReason,
  ExternalReferenceEmbedPolicyDecision,
  ExternalReferenceMetadataResult
} from '@xnetjs/data'

export type CanvasExternalReferenceEmbedFallbackReason =
  | ExternalReferenceEmbedBlockReason
  | 'offline'
  | 'provider-denied'
  | 'metadata-unavailable'
  | 'metadata-error'

export type CanvasExternalReferenceEmbedFallbackTone = 'neutral' | 'warning' | 'danger'

export type CanvasExternalReferenceEmbedFallback = {
  reason: CanvasExternalReferenceEmbedFallbackReason
  label: string
  description: string
  tone: CanvasExternalReferenceEmbedFallbackTone
  disablesLiveEmbed: boolean
}

export type CreateCanvasExternalReferenceEmbedFallbackInput = {
  policyDecision: ExternalReferenceEmbedPolicyDecision
  metadataResult?: ExternalReferenceMetadataResult | null
  lifecycleStatus?: string | null
  providerLabel: string
  emptyStateLabel: string
}

function normalizeStatus(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null
}

function normalizeProviderLabel(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : 'This provider'
}

function createPolicyFallback(input: {
  reason: ExternalReferenceEmbedBlockReason
  providerLabel: string
  emptyStateLabel: string
}): CanvasExternalReferenceEmbedFallback {
  const providerLabel = normalizeProviderLabel(input.providerLabel)

  switch (input.reason) {
    case 'missing-embed-url':
      return {
        reason: input.reason,
        label: input.emptyStateLabel,
        description: `${providerLabel} does not provide a live embed for this source. The original link is still available as a safe card.`,
        tone: 'neutral',
        disablesLiveEmbed: true
      }
    case 'invalid-embed-url':
      return {
        reason: input.reason,
        label: 'Embed blocked',
        description: 'The embed URL is invalid or is not served over HTTPS.',
        tone: 'danger',
        disablesLiveEmbed: true
      }
    case 'provider-blocked':
      return {
        reason: input.reason,
        label: 'Embed blocked',
        description: `Workspace policy does not allow live embeds from ${providerLabel}.`,
        tone: 'danger',
        disablesLiveEmbed: true
      }
    case 'origin-blocked':
      return {
        reason: input.reason,
        label: 'Embed blocked',
        description: `This embed uses an origin that is not allowed for ${providerLabel}.`,
        tone: 'danger',
        disablesLiveEmbed: true
      }
    case 'arbitrary-iframe-blocked':
      return {
        reason: input.reason,
        label: 'Embed blocked',
        description: 'Arbitrary iframe embeds are disabled for this workspace.',
        tone: 'danger',
        disablesLiveEmbed: true
      }
  }
}

export function createCanvasExternalReferenceEmbedFallback({
  policyDecision,
  metadataResult,
  lifecycleStatus,
  providerLabel,
  emptyStateLabel
}: CreateCanvasExternalReferenceEmbedFallbackInput): CanvasExternalReferenceEmbedFallback | null {
  const normalizedLifecycleStatus = normalizeStatus(lifecycleStatus)
  const normalizedProviderLabel = normalizeProviderLabel(providerLabel)

  if (normalizedLifecycleStatus === 'offline') {
    return {
      reason: 'offline',
      label: 'Embed offline',
      description: `Showing a safe ${normalizedProviderLabel} link card until the provider reconnects.`,
      tone: 'warning',
      disablesLiveEmbed: true
    }
  }

  if (normalizedLifecycleStatus === 'blocked') {
    return {
      reason: 'provider-denied',
      label: 'Embed blocked',
      description: `${normalizedProviderLabel} content is blocked by the current source or workspace policy.`,
      tone: 'danger',
      disablesLiveEmbed: true
    }
  }

  if (normalizedLifecycleStatus === 'provider-denied') {
    return {
      reason: 'provider-denied',
      label: 'Provider denied',
      description: `${normalizedProviderLabel} denied the live embed. The source link is preserved so the object remains recoverable.`,
      tone: 'danger',
      disablesLiveEmbed: true
    }
  }

  if (!policyDecision.allowed) {
    return createPolicyFallback({
      reason: policyDecision.reason,
      providerLabel: normalizedProviderLabel,
      emptyStateLabel
    })
  }

  if (metadataResult?.status === 'blocked') {
    return {
      reason: 'provider-denied',
      label: 'Provider denied',
      description: `${normalizedProviderLabel} denied rich metadata for this reference. Live embed activation can still be attempted if permitted.`,
      tone: 'danger',
      disablesLiveEmbed: false
    }
  }

  if (metadataResult?.status === 'error') {
    return {
      reason: 'metadata-error',
      label: 'Preview unavailable',
      description: `Rich metadata could not be loaded from ${normalizedProviderLabel}.`,
      tone: 'warning',
      disablesLiveEmbed: false
    }
  }

  if (metadataResult?.status === 'unavailable') {
    return {
      reason: 'metadata-unavailable',
      label: emptyStateLabel,
      description: `No rich preview is available from ${normalizedProviderLabel} yet.`,
      tone: 'neutral',
      disablesLiveEmbed: false
    }
  }

  return null
}
