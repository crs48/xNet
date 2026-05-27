/**
 * External-reference metadata resolution pipeline.
 */

import type { ExternalReferenceProvider } from './external-references'
import { parseExternalReferenceUrl } from './external-references'

export type ExternalReferenceMetadataSource = 'oembed' | 'open-graph'

export type ExternalReferenceMetadataStatus = 'resolved' | 'unavailable' | 'blocked' | 'error'

export type ExternalReferenceResolvedMetadata = {
  title: string | null
  subtitle: string | null
  description: string | null
  imageUrl: string | null
  providerName: string | null
  authorName: string | null
  source: ExternalReferenceMetadataSource
  sourceUrl: string
}

export type ExternalReferenceMetadataResult =
  | {
      status: 'resolved'
      metadata: ExternalReferenceResolvedMetadata
    }
  | {
      status: Exclude<ExternalReferenceMetadataStatus, 'resolved'>
      metadata: null
      reason: string
      source?: ExternalReferenceMetadataSource
      sourceUrl?: string
      error?: string
    }

export type ExternalReferenceMetadataFetcher = (
  url: string,
  init?: RequestInit
) => Promise<Response>

export type ResolveExternalReferenceMetadataInput = {
  url: string
  provider?: string | null
  fallbackTitle?: string | null
  fallbackSubtitle?: string | null
  fetcher?: ExternalReferenceMetadataFetcher
  signal?: AbortSignal
  allowOEmbed?: boolean
  allowOpenGraph?: boolean
  openGraphProxyUrl?: string | ((url: string) => string | null)
}

type OEmbedResponse = {
  title?: unknown
  author_name?: unknown
  provider_name?: unknown
  thumbnail_url?: unknown
}

type OpenGraphMetadata = {
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

const OEMBED_PROVIDERS = new Set<ExternalReferenceProvider>([
  'youtube',
  'vimeo',
  'spotify',
  'twitter'
])

const KNOWN_EXTERNAL_REFERENCE_PROVIDERS: readonly ExternalReferenceProvider[] = [
  'github',
  'figma',
  'youtube',
  'loom',
  'vimeo',
  'codesandbox',
  'spotify',
  'twitter',
  'instagram',
  'tiktok',
  'generic'
]

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeProvider(value: string | null | undefined): ExternalReferenceProvider | null {
  if (!value) {
    return null
  }

  return KNOWN_EXTERNAL_REFERENCE_PROVIDERS.includes(value as ExternalReferenceProvider)
    ? (value as ExternalReferenceProvider)
    : null
}

function getResolvedProvider(input: {
  url: string
  provider?: string | null
}): ExternalReferenceProvider {
  const parsed = parseExternalReferenceUrl(input.url)
  const provider = normalizeProvider(input.provider)
  return provider && provider !== 'generic' ? provider : (parsed?.provider ?? provider ?? 'generic')
}

export function getExternalReferenceOEmbedEndpoint(input: {
  url: string
  provider?: string | null
}): string | null {
  const provider = getResolvedProvider(input)
  if (!OEMBED_PROVIDERS.has(provider)) {
    return null
  }

  const encodedUrl = encodeURIComponent(input.url)

  switch (provider) {
    case 'youtube':
      return `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`
    case 'vimeo':
      return `https://vimeo.com/api/oembed.json?url=${encodedUrl}`
    case 'spotify':
      return `https://open.spotify.com/oembed?url=${encodedUrl}`
    case 'twitter':
      return `https://publish.x.com/oembed?url=${encodedUrl}&omit_script=true`
    default:
      return null
  }
}

function toAuthorHandle(value: string | null): string | null {
  if (!value) {
    return null
  }

  return value.startsWith('@') ? value : `@${value}`
}

function createResolvedMetadata(
  source: ExternalReferenceMetadataSource,
  sourceUrl: string,
  input: {
    title?: string | null
    subtitle?: string | null
    description?: string | null
    imageUrl?: string | null
    providerName?: string | null
    authorName?: string | null
  }
): ExternalReferenceResolvedMetadata | null {
  const title = normalizeString(input.title)
  const subtitle = normalizeString(input.subtitle)
  const description = normalizeString(input.description)
  const imageUrl = normalizeString(input.imageUrl)
  const providerName = normalizeString(input.providerName)
  const authorName = normalizeString(input.authorName)

  if (!title && !subtitle && !description && !imageUrl && !providerName && !authorName) {
    return null
  }

  return {
    title,
    subtitle,
    description,
    imageUrl,
    providerName,
    authorName,
    source,
    sourceUrl
  }
}

function resolveOEmbedMetadata(input: {
  provider: ExternalReferenceProvider
  sourceUrl: string
  payload: OEmbedResponse
  fallbackTitle?: string | null
  fallbackSubtitle?: string | null
}): ExternalReferenceResolvedMetadata | null {
  const providerName = normalizeString(input.payload.provider_name)
  const title = normalizeString(input.payload.title)
  const authorName = normalizeString(input.payload.author_name)
  const authorHandle = input.provider === 'twitter' ? toAuthorHandle(authorName) : authorName

  return createResolvedMetadata('oembed', input.sourceUrl, {
    title:
      input.provider === 'twitter' && !title && authorHandle
        ? `Post from ${authorHandle}`
        : (title ?? input.fallbackTitle),
    subtitle: authorHandle ?? providerName ?? input.fallbackSubtitle,
    imageUrl: normalizeString(input.payload.thumbnail_url),
    providerName,
    authorName: authorHandle
  })
}

function getOpenGraphRequestUrl(input: ResolveExternalReferenceMetadataInput): string | null {
  if (typeof input.openGraphProxyUrl === 'function') {
    return input.openGraphProxyUrl(input.url)
  }

  if (typeof input.openGraphProxyUrl === 'string') {
    const separator = input.openGraphProxyUrl.includes('?') ? '&' : '?'
    return `${input.openGraphProxyUrl}${separator}url=${encodeURIComponent(input.url)}`
  }

  return input.url
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function getHtmlAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  const match = tag.match(pattern)
  return match ? decodeHtmlEntities(match[1] ?? '').trim() : null
}

function getMetaContent(html: string, names: readonly string[]): string | null {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? []
  for (const tag of tags) {
    const property = getHtmlAttribute(tag, 'property') ?? getHtmlAttribute(tag, 'name')
    if (!property || !names.includes(property.toLowerCase())) {
      continue
    }

    const content = getHtmlAttribute(tag, 'content')
    if (content) {
      return content
    }
  }

  return null
}

function getTitleTagContent(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match
    ? decodeHtmlEntities(match[1] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    : null
}

export function parseOpenGraphMetadata(html: string): OpenGraphMetadata {
  return {
    title: getMetaContent(html, ['og:title', 'twitter:title']) ?? getTitleTagContent(html) ?? null,
    description: getMetaContent(html, ['og:description', 'description', 'twitter:description']),
    imageUrl: getMetaContent(html, ['og:image', 'twitter:image']),
    siteName: getMetaContent(html, ['og:site_name', 'application-name'])
  }
}

function toFailureResult(input: {
  status?: Exclude<ExternalReferenceMetadataStatus, 'resolved'>
  reason: string
  source?: ExternalReferenceMetadataSource
  sourceUrl?: string
  error?: unknown
}): ExternalReferenceMetadataResult {
  const error =
    input.error instanceof Error
      ? input.error.message
      : input.error === undefined
        ? undefined
        : String(input.error)

  return {
    status: input.status ?? 'unavailable',
    metadata: null,
    reason: input.reason,
    source: input.source,
    sourceUrl: input.sourceUrl,
    ...(error ? { error } : {})
  }
}

function getFetchStatus(response: Response): Exclude<ExternalReferenceMetadataStatus, 'resolved'> {
  return response.status === 401 || response.status === 403 ? 'blocked' : 'unavailable'
}

async function resolveOEmbed(
  input: ResolveExternalReferenceMetadataInput
): Promise<ExternalReferenceMetadataResult | null> {
  if (input.allowOEmbed === false) {
    return null
  }

  const provider = getResolvedProvider(input)
  const endpoint = getExternalReferenceOEmbedEndpoint(input)
  if (!endpoint || !input.fetcher) {
    return null
  }

  try {
    const response = await input.fetcher(endpoint, {
      headers: {
        Accept: 'application/json'
      },
      signal: input.signal
    })

    if (!response.ok) {
      return {
        status: getFetchStatus(response),
        metadata: null,
        reason: `oEmbed request failed with ${response.status}`,
        source: 'oembed',
        sourceUrl: endpoint
      }
    }

    const payload = (await response.json()) as OEmbedResponse
    const metadata = resolveOEmbedMetadata({
      provider,
      sourceUrl: endpoint,
      payload,
      fallbackTitle: input.fallbackTitle,
      fallbackSubtitle: input.fallbackSubtitle
    })

    return metadata
      ? { status: 'resolved', metadata }
      : toFailureResult({
          reason: 'oEmbed response did not include display metadata',
          source: 'oembed',
          sourceUrl: endpoint
        })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return toFailureResult({
      status: 'error',
      reason: 'oEmbed request failed',
      source: 'oembed',
      sourceUrl: endpoint,
      error
    })
  }
}

async function resolveOpenGraph(
  input: ResolveExternalReferenceMetadataInput
): Promise<ExternalReferenceMetadataResult | null> {
  if (input.allowOpenGraph !== true || !input.fetcher) {
    return null
  }

  const requestUrl = getOpenGraphRequestUrl(input)
  if (!requestUrl) {
    return null
  }

  try {
    const response = await input.fetcher(requestUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: input.signal
    })

    if (!response.ok) {
      return {
        status: getFetchStatus(response),
        metadata: null,
        reason: `Open Graph request failed with ${response.status}`,
        source: 'open-graph',
        sourceUrl: requestUrl
      }
    }

    const html = await response.text()
    const metadata = parseOpenGraphMetadata(html)
    const resolved = createResolvedMetadata('open-graph', requestUrl, {
      title: metadata.title ?? input.fallbackTitle,
      subtitle: metadata.siteName ?? input.fallbackSubtitle,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      providerName: metadata.siteName
    })

    return resolved
      ? { status: 'resolved', metadata: resolved }
      : toFailureResult({
          reason: 'Open Graph response did not include display metadata',
          source: 'open-graph',
          sourceUrl: requestUrl
        })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return toFailureResult({
      status: 'error',
      reason: 'Open Graph request failed',
      source: 'open-graph',
      sourceUrl: requestUrl,
      error
    })
  }
}

export async function resolveExternalReferenceMetadata(
  input: ResolveExternalReferenceMetadataInput
): Promise<ExternalReferenceMetadataResult> {
  const fetcher = input.fetcher ?? globalThis.fetch?.bind(globalThis)
  if (!fetcher) {
    return toFailureResult({
      reason: 'No metadata fetcher is available'
    })
  }

  const normalizedInput = { ...input, fetcher }
  const oembed = await resolveOEmbed(normalizedInput)
  if (oembed?.status === 'resolved' || oembed?.status === 'blocked') {
    return oembed
  }

  const openGraph = await resolveOpenGraph(normalizedInput)
  if (openGraph) {
    return openGraph
  }

  return (
    oembed ??
    toFailureResult({
      reason: 'No metadata resolver matched this reference'
    })
  )
}
