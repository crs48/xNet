/**
 * Export-safe iframe placeholders for canvas preview models.
 */

import type { CanvasPreviewModel, CanvasPreviewSourceRef } from './model'
import type { CanvasThumbnailOutput } from './thumbnail-output'
import { createCanvasPreviewModel } from './model'
import { createCanvasThumbnailOutput } from './thumbnail-output'

export type CanvasIframePlaceholderReason =
  | 'export'
  | 'thumbnail'
  | 'offline'
  | 'policy-blocked'
  | 'provider-denied'
  | 'budget-exceeded'

export type CreateCanvasIframePlaceholderInput = {
  objectId: string
  title: string
  url: string
  embedUrl?: string | null
  provider?: string | null
  sourceRef?: CanvasPreviewSourceRef
  width?: number
  height?: number
  reason?: CanvasIframePlaceholderReason
}

function normalizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function getProviderLabel(provider: string | null | undefined): string {
  const normalized = normalizeValue(provider)
  if (!normalized) {
    return 'External embed'
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function createCanvasIframePlaceholderThumbnail(
  input: CreateCanvasIframePlaceholderInput
): CanvasThumbnailOutput {
  const providerLabel = getProviderLabel(input.provider)

  return createCanvasThumbnailOutput({
    kind: 'iframe-placeholder',
    title: input.title,
    subtitle: `${providerLabel} embed placeholder`,
    provider: normalizeValue(input.provider) ?? providerLabel,
    sourceRef: input.sourceRef,
    width: input.width,
    height: input.height
  })
}

export function createCanvasIframeExportPreview(
  input: CreateCanvasIframePlaceholderInput
): CanvasPreviewModel {
  const providerLabel = getProviderLabel(input.provider)
  const reason = input.reason ?? 'export'
  const url = normalizeValue(input.url) ?? input.url
  const embedUrl = normalizeValue(input.embedUrl)

  return createCanvasPreviewModel({
    objectId: input.objectId,
    objectKind: 'external-reference',
    sourceRef: input.sourceRef,
    summary: {
      title: input.title,
      subtitle: providerLabel,
      description: 'Live iframe content is represented by a deterministic placeholder for export.',
      icon: 'EMBED',
      status: 'ready'
    },
    thumbnail: createCanvasIframePlaceholderThumbnail(input),
    shell: {
      title: input.title,
      subtitle: providerLabel,
      metadata: {
        iframePlaceholder: true,
        exportSafe: true,
        placeholderReason: reason,
        provider: normalizeValue(input.provider) ?? providerLabel,
        url,
        embedUrl
      }
    },
    preferredTier: 'thumbnail',
    actions: [
      {
        id: 'open-source',
        label: 'Open source',
        kind: 'open'
      },
      {
        id: 'copy-link',
        label: 'Copy link',
        kind: 'copy-link'
      }
    ]
  })
}

export function isCanvasIframePlaceholderPreview(model: CanvasPreviewModel): boolean {
  return model.live === undefined && model.shell?.metadata?.iframePlaceholder === true
}
