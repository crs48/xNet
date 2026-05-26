/**
 * Deterministic thumbnail outputs for canvas preview generation.
 */

import type { CanvasPreviewSourceRef, CanvasPreviewThumbnail } from './model'

export type CanvasThumbnailOutputKind =
  | 'image'
  | 'pdf'
  | 'generic-file'
  | 'url-card'
  | 'video-poster'
  | 'audio-card'

export type CreateCanvasThumbnailOutputInput = {
  kind: CanvasThumbnailOutputKind
  title: string
  subtitle?: string
  mimeType?: string
  sourceRef?: CanvasPreviewSourceRef
  width?: number
  height?: number
  imageUrl?: string
  posterUrl?: string
  provider?: string
}

export type CanvasThumbnailOutput = CanvasPreviewThumbnail & {
  kind: CanvasThumbnailOutputKind
  cacheKey: string
  generated: boolean
  accentColor: string
  sourceRef?: CanvasPreviewSourceRef
}

const DEFAULT_THUMBNAIL_WIDTH = 320
const DEFAULT_THUMBNAIL_HEIGHT = 180
const THUMBNAIL_PALETTE = [
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#ca8a04',
  '#0891b2',
  '#be123c',
  '#4f46e5'
] as const

const KIND_LABELS: Record<CanvasThumbnailOutputKind, string> = {
  image: 'IMG',
  pdf: 'PDF',
  'generic-file': 'FILE',
  'url-card': 'LINK',
  'video-poster': 'VIDEO',
  'audio-card': 'AUDIO'
}

function hashString(input: string): string {
  let hash = 2_166_136_261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return (hash >>> 0).toString(36)
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function truncateText(input: string, maxLength: number): string {
  return input.length <= maxLength ? input : `${input.slice(0, Math.max(0, maxLength - 1))}.`
}

function getThumbnailSeed(input: CreateCanvasThumbnailOutputInput): string {
  const source = input.sourceRef

  return [
    input.kind,
    input.title,
    input.subtitle ?? '',
    input.mimeType ?? '',
    input.provider ?? '',
    source?.nodeId ?? 'local',
    source?.schemaId ?? 'none',
    source?.version ?? '0',
    source?.contentHash ?? 'none'
  ].join(':')
}

function getThumbnailAccentColor(seed: string): string {
  const hash = Number.parseInt(hashString(seed), 36)
  return THUMBNAIL_PALETTE[hash % THUMBNAIL_PALETTE.length]
}

function getThumbnailRasterUrl(input: CreateCanvasThumbnailOutputInput): string | null {
  if (input.kind === 'image' && input.imageUrl) {
    return input.imageUrl
  }

  if (input.kind === 'video-poster' && input.posterUrl) {
    return input.posterUrl
  }

  return null
}

export function getCanvasThumbnailOutputCacheKey(input: CreateCanvasThumbnailOutputInput): string {
  const source = input.sourceRef
  const fallbackHash = hashString(getThumbnailSeed(input))

  return [
    'thumbnail',
    input.kind,
    source?.nodeId ?? 'local',
    source?.schemaId ?? 'none',
    source?.version ?? '0',
    source?.contentHash ?? fallbackHash
  ].join(':')
}

function createGeneratedThumbnailUrl(input: CreateCanvasThumbnailOutputInput): string {
  const seed = getThumbnailSeed(input)
  const accentColor = getThumbnailAccentColor(seed)
  const width = input.width ?? DEFAULT_THUMBNAIL_WIDTH
  const height = input.height ?? DEFAULT_THUMBNAIL_HEIGHT
  const title = escapeXml(truncateText(input.title || KIND_LABELS[input.kind], 34))
  const subtitle = escapeXml(
    truncateText(input.subtitle ?? input.provider ?? input.mimeType ?? input.kind, 44)
  )
  const label = KIND_LABELS[input.kind]

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" rx="18" fill="#f8fafc"/>',
    `<rect x="0" y="0" width="${width}" height="10" fill="${accentColor}"/>`,
    `<rect x="22" y="28" width="74" height="54" rx="10" fill="${accentColor}" opacity="0.14"/>`,
    `<text x="59" y="62" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="${accentColor}">${label}</text>`,
    `<text x="22" y="118" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">${title}</text>`,
    `<text x="22" y="146" font-family="Inter, Arial, sans-serif" font-size="13" fill="#475569">${subtitle}</text>`,
    '</svg>'
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createCanvasThumbnailOutput(
  input: CreateCanvasThumbnailOutputInput
): CanvasThumbnailOutput {
  const seed = getThumbnailSeed(input)
  const accentColor = getThumbnailAccentColor(seed)
  const rasterUrl = getThumbnailRasterUrl(input)
  const generated = rasterUrl === null
  const width = input.width ?? DEFAULT_THUMBNAIL_WIDTH
  const height = input.height ?? DEFAULT_THUMBNAIL_HEIGHT

  return {
    kind: input.kind,
    cacheKey: getCanvasThumbnailOutputCacheKey(input),
    generated,
    accentColor,
    sourceRef: input.sourceRef,
    url: rasterUrl ?? createGeneratedThumbnailUrl(input),
    mimeType: generated ? 'image/svg+xml' : input.mimeType,
    width,
    height,
    alt: `${input.title} thumbnail`
  }
}
