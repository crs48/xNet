/**
 * Preview model contract for canvas objects across LOD tiers.
 */

import type { CanvasObjectKind, Rect } from '../types'

export type CanvasPreviewTier = 'summary' | 'thumbnail' | 'shell' | 'live'

export type CanvasPreviewLifecycleStatus =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'error'
  | 'blocked'
  | 'offline'

export type CanvasPreviewSourceRef = {
  nodeId?: string
  schemaId?: string
  version?: string | number
  contentHash?: string
}

export type CanvasPreviewSummary = {
  title: string
  subtitle?: string
  description?: string
  icon?: string
  status?: CanvasPreviewLifecycleStatus
}

export type CanvasPreviewThumbnail = {
  url?: string
  blobId?: string
  mimeType?: string
  width?: number
  height?: number
  alt?: string
}

export type CanvasPreviewShell = {
  title?: string
  subtitle?: string
  metadata?: Record<string, string | number | boolean | null>
}

export type CanvasPreviewLiveSurface = {
  provider?: string
  url?: string
  embedUrl?: string
  activation: 'none' | 'click-to-activate' | 'auto'
  budgetKey?: string
}

export type CanvasPreviewAnchor = {
  id: string
  label: string
  kind: 'object' | 'page' | 'row' | 'heading' | 'selection' | 'custom'
  rect?: Rect
  sourceRef?: CanvasPreviewSourceRef
}

export type CanvasPreviewActionKind =
  | 'open'
  | 'focus'
  | 'retry'
  | 'replace-source'
  | 'copy-link'
  | 'comment'
  | 'connect'
  | 'custom'

export type CanvasPreviewAction = {
  id: string
  label: string
  kind: CanvasPreviewActionKind
  disabled?: boolean
  destructive?: boolean
}

export type CanvasPreviewModel = {
  id: string
  objectId: string
  objectKind: CanvasObjectKind
  sourceRef?: CanvasPreviewSourceRef
  availableTiers: CanvasPreviewTier[]
  preferredTier: CanvasPreviewTier
  summary: CanvasPreviewSummary
  thumbnail?: CanvasPreviewThumbnail
  shell?: CanvasPreviewShell
  live?: CanvasPreviewLiveSurface
  anchors: CanvasPreviewAnchor[]
  actions: CanvasPreviewAction[]
}

export type CreateCanvasPreviewModelInput = Omit<
  CanvasPreviewModel,
  'id' | 'availableTiers' | 'preferredTier' | 'anchors' | 'actions'
> &
  Partial<
    Pick<CanvasPreviewModel, 'id' | 'availableTiers' | 'preferredTier' | 'anchors' | 'actions'>
  >

const PREVIEW_TIER_ORDER: readonly CanvasPreviewTier[] = ['summary', 'thumbnail', 'shell', 'live']

function uniqPreviewTiers(tiers: readonly CanvasPreviewTier[]): CanvasPreviewTier[] {
  return PREVIEW_TIER_ORDER.filter((tier) => tiers.includes(tier))
}

function inferAvailablePreviewTiers(input: CreateCanvasPreviewModelInput): CanvasPreviewTier[] {
  return uniqPreviewTiers([
    'summary',
    ...(input.thumbnail ? (['thumbnail'] as const) : []),
    ...(input.shell ? (['shell'] as const) : []),
    ...(input.live ? (['live'] as const) : [])
  ])
}

export function createCanvasPreviewModel(input: CreateCanvasPreviewModelInput): CanvasPreviewModel {
  const availableTiers = input.availableTiers
    ? uniqPreviewTiers(input.availableTiers)
    : inferAvailablePreviewTiers(input)
  const preferredTier =
    input.preferredTier && availableTiers.includes(input.preferredTier)
      ? input.preferredTier
      : (availableTiers[availableTiers.length - 1] ?? 'summary')

  return {
    ...input,
    id: input.id ?? input.objectId,
    availableTiers,
    preferredTier,
    anchors: input.anchors ?? [],
    actions: input.actions ?? []
  }
}

export function getCanvasPreviewCacheKey(model: CanvasPreviewModel): string {
  const source = model.sourceRef
  return [
    model.objectId,
    source?.nodeId ?? 'local',
    source?.schemaId ?? 'none',
    source?.version ?? '0',
    source?.contentHash ?? 'none'
  ].join(':')
}
