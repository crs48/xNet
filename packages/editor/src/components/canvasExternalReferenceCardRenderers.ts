/**
 * Provider-specific renderer descriptors for canvas external-reference cards.
 */

import type { ExternalReferenceDescriptor, ExternalReferenceProvider } from '@xnetjs/data'
import { parseExternalReferenceUrl } from '@xnetjs/data'
import { createCanvasCardFieldId } from './canvasPermissionedCardFields'

export type CanvasExternalReferenceCardRendererKind =
  | 'github-record'
  | 'video'
  | 'audio'
  | 'design'
  | 'sandbox'
  | 'social'
  | 'link'

export type CanvasExternalReferenceCardAccent =
  | 'neutral'
  | 'blue'
  | 'green'
  | 'purple'
  | 'red'
  | 'pink'
  | 'amber'
  | 'slate'

export type CanvasExternalReferenceCardMetadata = {
  fieldId: string
  label: string
  value: string
}

export type CanvasExternalReferenceCardRenderer = {
  providerId: ExternalReferenceProvider
  providerLabel: string
  kind: CanvasExternalReferenceCardRendererKind
  accent: CanvasExternalReferenceCardAccent
  iconLabel: string
  badgeLabel: string
  liveBadgeLabel: string
  previewLabel: string
  emptyStateLabel: string
  metadata: readonly CanvasExternalReferenceCardMetadata[]
}

export type CreateCanvasExternalReferenceCardRendererInput = {
  url: string
  provider?: string | null
  embedUrl?: string | null
  title?: string | null
  subtitle?: string | null
}

type CanvasExternalReferenceCardRendererDefinition = {
  providerId: ExternalReferenceProvider
  providerLabel: string
  kind: CanvasExternalReferenceCardRendererKind
  accent: CanvasExternalReferenceCardAccent
  iconLabel: string
  previewLabel: string
  emptyStateLabel: string
  badgeLabel: (descriptor: ExternalReferenceDescriptor | null) => string
  metadata: (
    descriptor: ExternalReferenceDescriptor | null
  ) => readonly CanvasExternalReferenceCardMetadata[]
}

const EXTERNAL_REFERENCE_CARD_RENDERERS: Record<
  ExternalReferenceProvider,
  CanvasExternalReferenceCardRendererDefinition
> = {
  github: {
    providerId: 'github',
    providerLabel: 'GitHub',
    kind: 'github-record',
    accent: 'slate',
    iconLabel: 'GH',
    previewLabel: 'Repository reference',
    emptyStateLabel: 'GitHub source',
    badgeLabel: (descriptor) => {
      if (descriptor?.kind === 'pull-request') {
        return 'GitHub pull request'
      }

      if (descriptor?.kind === 'issue') {
        return 'GitHub issue'
      }

      return 'GitHub reference'
    },
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata(
          'Repo',
          joinMetadataParts([descriptor?.metadata.owner, descriptor?.metadata.repo])
        ),
        createMetadata('Number', descriptor?.metadata.number)
      ])
  },
  figma: {
    providerId: 'figma',
    providerLabel: 'Figma',
    kind: 'design',
    accent: 'purple',
    iconLabel: 'FG',
    previewLabel: 'Design file',
    emptyStateLabel: 'Figma source',
    badgeLabel: () => 'Figma design',
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Type', descriptor?.metadata.entity),
        createMetadata('File', descriptor?.metadata.fileId)
      ])
  },
  youtube: {
    providerId: 'youtube',
    providerLabel: 'YouTube',
    kind: 'video',
    accent: 'red',
    iconLabel: 'YT',
    previewLabel: 'Video player',
    emptyStateLabel: 'YouTube source',
    badgeLabel: () => 'YouTube video',
    metadata: (descriptor) =>
      compactMetadata([createMetadata('Video', descriptor?.metadata.videoId)])
  },
  loom: {
    providerId: 'loom',
    providerLabel: 'Loom',
    kind: 'video',
    accent: 'blue',
    iconLabel: 'LO',
    previewLabel: 'Recording player',
    emptyStateLabel: 'Loom source',
    badgeLabel: () => 'Loom recording',
    metadata: (descriptor) =>
      compactMetadata([createMetadata('Recording', descriptor?.metadata.loomId)])
  },
  vimeo: {
    providerId: 'vimeo',
    providerLabel: 'Vimeo',
    kind: 'video',
    accent: 'blue',
    iconLabel: 'VI',
    previewLabel: 'Video player',
    emptyStateLabel: 'Vimeo source',
    badgeLabel: () => 'Vimeo video',
    metadata: (descriptor) =>
      compactMetadata([createMetadata('Video', descriptor?.metadata.videoId)])
  },
  codesandbox: {
    providerId: 'codesandbox',
    providerLabel: 'CodeSandbox',
    kind: 'sandbox',
    accent: 'slate',
    iconLabel: 'CS',
    previewLabel: 'Live sandbox',
    emptyStateLabel: 'Sandbox source',
    badgeLabel: () => 'CodeSandbox project',
    metadata: (descriptor) =>
      compactMetadata([createMetadata('Sandbox', descriptor?.metadata.sandboxId)])
  },
  spotify: {
    providerId: 'spotify',
    providerLabel: 'Spotify',
    kind: 'audio',
    accent: 'green',
    iconLabel: 'SP',
    previewLabel: 'Audio player',
    emptyStateLabel: 'Spotify source',
    badgeLabel: (descriptor) => {
      const entity = descriptor?.metadata.entity
      return entity ? `Spotify ${entity}` : 'Spotify audio'
    },
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Type', descriptor?.metadata.entity),
        createMetadata('Id', descriptor?.metadata.mediaId)
      ])
  },
  twitter: {
    providerId: 'twitter',
    providerLabel: 'X',
    kind: 'social',
    accent: 'slate',
    iconLabel: 'X',
    previewLabel: 'Social post',
    emptyStateLabel: 'Post source',
    badgeLabel: () => 'X post',
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Author', descriptor?.metadata.author),
        createMetadata('Post', descriptor?.metadata.postId)
      ])
  },
  instagram: {
    providerId: 'instagram',
    providerLabel: 'Instagram',
    kind: 'social',
    accent: 'pink',
    iconLabel: 'IG',
    previewLabel: 'Social post',
    emptyStateLabel: 'Instagram source',
    badgeLabel: (descriptor) => {
      const entity = descriptor?.metadata.entity
      return entity === 'reel' ? 'Instagram reel' : 'Instagram post'
    },
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Type', descriptor?.metadata.entity),
        createMetadata('Media', descriptor?.metadata.mediaId)
      ])
  },
  tiktok: {
    providerId: 'tiktok',
    providerLabel: 'TikTok',
    kind: 'social',
    accent: 'pink',
    iconLabel: 'TT',
    previewLabel: 'Social video',
    emptyStateLabel: 'TikTok source',
    badgeLabel: () => 'TikTok video',
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Author', descriptor?.metadata.author),
        createMetadata('Video', descriptor?.metadata.videoId)
      ])
  },
  generic: {
    providerId: 'generic',
    providerLabel: 'Link',
    kind: 'link',
    accent: 'neutral',
    iconLabel: 'LN',
    previewLabel: 'Link preview',
    emptyStateLabel: 'Web source',
    badgeLabel: () => 'Link preview',
    metadata: (descriptor) =>
      compactMetadata([
        createMetadata('Host', descriptor?.metadata.hostname),
        createMetadata('Path', descriptor?.metadata.path)
      ])
  }
}

function normalizeProvider(value: string | null | undefined): ExternalReferenceProvider | null {
  if (!value) {
    return null
  }

  return value in EXTERNAL_REFERENCE_CARD_RENDERERS ? (value as ExternalReferenceProvider) : null
}

function compactMetadata(
  entries: readonly (CanvasExternalReferenceCardMetadata | null)[]
): readonly CanvasExternalReferenceCardMetadata[] {
  return entries.filter((entry): entry is CanvasExternalReferenceCardMetadata => entry !== null)
}

function createMetadata(
  label: string,
  value: string | null | undefined,
  fieldId = createCanvasCardFieldId(label)
): CanvasExternalReferenceCardMetadata | null {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return {
    fieldId,
    label,
    value: normalized
  }
}

function joinMetadataParts(parts: readonly (string | null | undefined)[]): string | null {
  const normalized = parts.filter((part): part is string => typeof part === 'string' && part !== '')
  return normalized.length > 0 ? normalized.join('/') : null
}

export function createCanvasExternalReferenceCardRenderer(
  input: CreateCanvasExternalReferenceCardRendererInput
): CanvasExternalReferenceCardRenderer {
  const descriptor = parseExternalReferenceUrl(input.url)
  const inputProvider = normalizeProvider(input.provider)
  const providerId =
    inputProvider && inputProvider !== 'generic'
      ? inputProvider
      : (descriptor?.provider ?? inputProvider ?? 'generic')
  const definition = EXTERNAL_REFERENCE_CARD_RENDERERS[providerId]
  const hasLiveEmbed = Boolean(input.embedUrl ?? descriptor?.embedUrl)
  const badgeLabel = definition.badgeLabel(descriptor)

  return {
    providerId,
    providerLabel: definition.providerLabel,
    kind: definition.kind,
    accent: definition.accent,
    iconLabel: definition.iconLabel,
    badgeLabel,
    liveBadgeLabel: hasLiveEmbed ? `${badgeLabel} embed` : badgeLabel,
    previewLabel: definition.previewLabel,
    emptyStateLabel: definition.emptyStateLabel,
    metadata: definition.metadata(descriptor).slice(0, 2)
  }
}
