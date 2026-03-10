/**
 * Canvas ingestion utilities.
 *
 * Normalizes drag/drop, paste, and command-driven payloads into source-backed
 * canvas object creation inputs.
 */

import type { CanvasNode, CanvasObjectKind, Point, Rect } from './types'
import { DatabaseSchema, ExternalReferenceSchema, MediaAssetSchema, PageSchema } from '@xnetjs/data'
import { createNode } from './store'

export const CANVAS_INTERNAL_NODE_MIME = 'application/x-xnet-canvas-node'
const CANVAS_STACK_OFFSET = 28
const DEFAULT_MEDIA_RECT = { width: 320, height: 240 }
const MAX_MEDIA_PREVIEW_WIDTH = 420
const MAX_MEDIA_PREVIEW_HEIGHT = 320

export type CanvasViewportSnapshot = {
  x: number
  y: number
  zoom: number
}

export type CanvasInternalNodeDragData = {
  nodeId: string
  schemaId: string
  title: string
  canvasKind?: Extract<CanvasObjectKind, 'page' | 'database' | 'note'>
}

export type CanvasIngressPayload =
  | { kind: 'internal-node'; data: CanvasInternalNodeDragData }
  | { kind: 'url'; url: string }
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string }

export type CanvasExternalReferenceProvider =
  | 'github'
  | 'figma'
  | 'youtube'
  | 'loom'
  | 'vimeo'
  | 'codesandbox'
  | 'spotify'
  | 'twitter'
  | 'generic'

export type CanvasExternalReferenceKind =
  | 'issue'
  | 'pull-request'
  | 'design'
  | 'video'
  | 'sandbox'
  | 'social'
  | 'audio'
  | 'link'

export type CanvasExternalReferenceDescriptor = {
  normalizedUrl: string
  provider: CanvasExternalReferenceProvider
  kind: CanvasExternalReferenceKind
  refId?: string
  title: string
  subtitle?: string
  icon?: string
  embedUrl?: string
  metadata: Record<string, string>
}

export type CanvasMediaKind = 'image' | 'video' | 'audio' | 'document' | 'file'

export type CanvasSourceBackedNodeInput = {
  objectKind: Extract<
    CanvasObjectKind,
    'page' | 'database' | 'external-reference' | 'media' | 'note'
  >
  viewport: CanvasViewportSnapshot
  sourceNodeId?: string
  sourceSchemaId?: string
  title?: string
  canvasPoint?: Point | null
  spreadIndex?: number
  rect?: Partial<Rect>
  properties?: Record<string, unknown>
}

export function serializeCanvasInternalNodeDragData(data: CanvasInternalNodeDragData): string {
  return JSON.stringify(data)
}

export function parseCanvasInternalNodeDragData(
  value: string | null | undefined
): CanvasInternalNodeDragData | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<CanvasInternalNodeDragData>
    if (
      typeof parsed.nodeId !== 'string' ||
      typeof parsed.schemaId !== 'string' ||
      typeof parsed.title !== 'string'
    ) {
      return null
    }

    if (
      parsed.canvasKind &&
      parsed.canvasKind !== 'page' &&
      parsed.canvasKind !== 'database' &&
      parsed.canvasKind !== 'note'
    ) {
      return null
    }

    return {
      nodeId: parsed.nodeId,
      schemaId: parsed.schemaId,
      title: parsed.title,
      ...(parsed.canvasKind ? { canvasKind: parsed.canvasKind } : {})
    }
  } catch {
    return null
  }
}

export function normalizeExternalReferenceUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)
      ? `https://${trimmed}`
      : null

  if (!candidate) {
    return null
  }

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    url.username = ''
    url.password = ''
    url.hash = ''

    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host}${pathname}${url.search}`
  } catch {
    return null
  }
}

function createGenericExternalReferenceDescriptor(
  normalizedUrl: string
): CanvasExternalReferenceDescriptor {
  const url = new URL(normalizedUrl)
  const hostname = url.hostname.replace(/^www\./i, '')
  const pathLabel = `${url.pathname}${url.search}`.trim() || normalizedUrl

  return {
    normalizedUrl,
    provider: 'generic',
    kind: 'link',
    title: hostname || normalizedUrl,
    subtitle: pathLabel === normalizedUrl ? undefined : pathLabel,
    icon: 'LINK',
    metadata: {
      hostname,
      path: url.pathname
    }
  }
}

export function describeExternalReference(input: string): CanvasExternalReferenceDescriptor | null {
  const normalizedUrl = normalizeExternalReferenceUrl(input)
  if (!normalizedUrl) {
    return null
  }

  const githubIssueMatch = normalizedUrl.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?].*)?$/i
  )
  if (githubIssueMatch) {
    const [, owner, repo, number] = githubIssueMatch
    return {
      normalizedUrl,
      provider: 'github',
      kind: 'issue',
      refId: `${owner}/${repo}#${number}`,
      title: `${repo}#${number}`,
      subtitle: owner,
      icon: 'GH',
      metadata: {
        owner,
        repo,
        number,
        entity: 'issue'
      }
    }
  }

  const githubPrMatch = normalizedUrl.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?].*)?$/i
  )
  if (githubPrMatch) {
    const [, owner, repo, number] = githubPrMatch
    return {
      normalizedUrl,
      provider: 'github',
      kind: 'pull-request',
      refId: `${owner}/${repo}#${number}`,
      title: `${repo} PR #${number}`,
      subtitle: owner,
      icon: 'PR',
      metadata: {
        owner,
        repo,
        number,
        entity: 'pull-request'
      }
    }
  }

  const figmaMatch = normalizedUrl.match(
    /^https?:\/\/(?:www\.)?figma\.com\/(file|proto)\/([a-z0-9]+)(?:[/?].*)?$/i
  )
  if (figmaMatch) {
    const [, entity, fileId] = figmaMatch
    return {
      normalizedUrl,
      provider: 'figma',
      kind: 'design',
      refId: `${entity}/${fileId}`,
      title: `Figma ${entity}`,
      subtitle: fileId,
      icon: 'FG',
      embedUrl: `https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/${entity}/${fileId}`,
      metadata: {
        entity,
        fileId
      }
    }
  }

  const youtubeMatch = normalizedUrl.match(
    /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-z0-9_-]+)/i
  )
  if (youtubeMatch) {
    const [, videoId] = youtubeMatch
    return {
      normalizedUrl,
      provider: 'youtube',
      kind: 'video',
      refId: videoId,
      title: `YouTube ${videoId}`,
      subtitle: 'YouTube',
      icon: 'YT',
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      metadata: {
        videoId
      }
    }
  }

  const vimeoMatch = normalizedUrl.match(
    /^https?:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[/?].*)?$/i
  )
  if (vimeoMatch) {
    const [, videoId] = vimeoMatch
    return {
      normalizedUrl,
      provider: 'vimeo',
      kind: 'video',
      refId: videoId,
      title: `Vimeo ${videoId}`,
      subtitle: 'Vimeo',
      icon: 'VI',
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      metadata: {
        videoId
      }
    }
  }

  const loomMatch = normalizedUrl.match(
    /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-f0-9]+)(?:[/?].*)?$/i
  )
  if (loomMatch) {
    const [, loomId] = loomMatch
    return {
      normalizedUrl,
      provider: 'loom',
      kind: 'video',
      refId: loomId,
      title: `Loom ${loomId.slice(0, 8)}`,
      subtitle: 'Loom',
      icon: 'LO',
      embedUrl: `https://www.loom.com/embed/${loomId}`,
      metadata: {
        loomId
      }
    }
  }

  const sandboxMatch = normalizedUrl.match(
    /^https?:\/\/(?:www\.)?codesandbox\.io\/(?:s|embed)\/([a-z0-9-]+)(?:[/?].*)?$/i
  )
  if (sandboxMatch) {
    const [, sandboxId] = sandboxMatch
    return {
      normalizedUrl,
      provider: 'codesandbox',
      kind: 'sandbox',
      refId: sandboxId,
      title: `Sandbox ${sandboxId}`,
      subtitle: 'CodeSandbox',
      icon: 'CS',
      embedUrl: `https://codesandbox.io/embed/${sandboxId}?fontsize=14&hidenavigation=1&theme=dark`,
      metadata: {
        sandboxId
      }
    }
  }

  const spotifyMatch = normalizedUrl.match(
    /^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-z0-9]+)(?:[/?].*)?$/i
  )
  if (spotifyMatch) {
    const [, entity, mediaId] = spotifyMatch
    return {
      normalizedUrl,
      provider: 'spotify',
      kind: 'audio',
      refId: `${entity}/${mediaId}`,
      title: `Spotify ${entity}`,
      subtitle: mediaId,
      icon: 'SP',
      embedUrl: `https://open.spotify.com/embed/${entity}/${mediaId}`,
      metadata: {
        entity,
        mediaId
      }
    }
  }

  const twitterMatch = normalizedUrl.match(
    /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)(?:[/?].*)?$/i
  )
  if (twitterMatch) {
    const [, postId] = twitterMatch
    return {
      normalizedUrl,
      provider: 'twitter',
      kind: 'social',
      refId: postId,
      title: `Post ${postId}`,
      subtitle: 'X',
      icon: 'X',
      embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${postId}`,
      metadata: {
        postId
      }
    }
  }

  return createGenericExternalReferenceDescriptor(normalizedUrl)
}

export function inferMediaKind(file: File): CanvasMediaKind {
  if (file.type.startsWith('image/')) {
    return 'image'
  }

  if (file.type.startsWith('video/')) {
    return 'video'
  }

  if (file.type.startsWith('audio/')) {
    return 'audio'
  }

  if (
    file.type === 'application/pdf' ||
    file.type.startsWith('text/') ||
    file.type.includes('document') ||
    file.type.includes('presentation') ||
    file.type.includes('spreadsheet')
  ) {
    return 'document'
  }

  return 'file'
}

export function getMediaRect(dimensions?: { width?: number; height?: number } | null): {
  width: number
  height: number
} {
  const width = dimensions?.width
  const height = dimensions?.height

  if (!width || !height || width <= 0 || height <= 0) {
    return DEFAULT_MEDIA_RECT
  }

  const scale = Math.min(MAX_MEDIA_PREVIEW_WIDTH / width, MAX_MEDIA_PREVIEW_HEIGHT / height, 1)
  return {
    width: Math.max(180, Math.round(width * scale)),
    height: Math.max(140, Math.round(height * scale))
  }
}

export async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) {
    return null
  }

  return await new Promise((resolve) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

export function getCanvasObjectKindFromSchema(
  schemaId: string,
  canvasKind?: Extract<CanvasObjectKind, 'page' | 'database' | 'note'>
): Extract<CanvasObjectKind, 'page' | 'database' | 'external-reference' | 'media' | 'note'> | null {
  if (canvasKind === 'note') {
    return 'note'
  }

  if (schemaId === PageSchema._schemaId) {
    return 'page'
  }

  if (schemaId === DatabaseSchema._schemaId) {
    return 'database'
  }

  if (schemaId === ExternalReferenceSchema._schemaId) {
    return 'external-reference'
  }

  if (schemaId === MediaAssetSchema._schemaId) {
    return 'media'
  }

  return null
}

export function resolveCanvasPlacementRect(input: {
  objectKind: Extract<
    CanvasObjectKind,
    'page' | 'database' | 'external-reference' | 'media' | 'note'
  >
  viewport: CanvasViewportSnapshot
  canvasPoint?: Point | null
  spreadIndex?: number
  rect?: Partial<Rect>
}): Rect {
  const spreadIndex = input.spreadIndex ?? 0
  const offset = spreadIndex * CANVAS_STACK_OFFSET
  const baseNode = createNode(input.objectKind, input.rect)
  const width = input.rect?.width ?? baseNode.position.width
  const height = input.rect?.height ?? baseNode.position.height
  const centerX = input.canvasPoint?.x ?? input.viewport.x
  const centerY = input.canvasPoint?.y ?? input.viewport.y

  return {
    x: Math.round(centerX - width / 2 + offset),
    y: Math.round(centerY - height / 2 + offset),
    width,
    height
  }
}

export function createSourceBackedCanvasNode(input: CanvasSourceBackedNodeInput): CanvasNode {
  const rect = resolveCanvasPlacementRect({
    objectKind: input.objectKind,
    viewport: input.viewport,
    canvasPoint: input.canvasPoint,
    spreadIndex: input.spreadIndex,
    rect: input.rect
  })

  const node = createNode(input.objectKind, rect, {
    ...(input.title ? { title: input.title } : {}),
    ...(input.properties ?? {})
  })

  if (input.sourceNodeId) {
    node.sourceNodeId = input.sourceNodeId
  }

  if (input.sourceSchemaId) {
    node.sourceSchemaId = input.sourceSchemaId
  }

  return node
}

function getUriListCandidate(dataTransfer: DataTransfer): string | null {
  const uriList = dataTransfer.getData('text/uri-list')
  if (!uriList) {
    return null
  }

  const candidate = uriList
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !value.startsWith('#'))

  return candidate ?? null
}

export function extractCanvasIngressPayloads(dataTransfer: DataTransfer): CanvasIngressPayload[] {
  const payloads: CanvasIngressPayload[] = []
  const internalData = parseCanvasInternalNodeDragData(
    dataTransfer.getData(CANVAS_INTERNAL_NODE_MIME)
  )

  if (internalData) {
    payloads.push({ kind: 'internal-node', data: internalData })
  }

  const files = Array.from(dataTransfer.files ?? [])
  if (files.length > 0) {
    payloads.push(...files.map((file) => ({ kind: 'file', file }) satisfies CanvasIngressPayload))
  }

  const uriCandidate = getUriListCandidate(dataTransfer)
  if (uriCandidate) {
    payloads.push({ kind: 'url', url: uriCandidate })
    return payloads
  }

  const text = dataTransfer.getData('text/plain').trim()
  if (text.length === 0) {
    return payloads
  }

  const normalizedUrl = normalizeExternalReferenceUrl(text)
  if (normalizedUrl) {
    payloads.push({ kind: 'url', url: normalizedUrl })
    return payloads
  }

  payloads.push({ kind: 'text', text })
  return payloads
}
