/**
 * Shared external-reference and embed parsing utilities.
 *
 * These helpers normalize URLs into source-backed external references so
 * editor surfaces, task chips, and canvas drops all resolve the same
 * provider, kind, metadata, and embed targets.
 */

export type ExternalReferenceProvider =
  | 'github'
  | 'figma'
  | 'youtube'
  | 'loom'
  | 'vimeo'
  | 'codesandbox'
  | 'spotify'
  | 'twitter'
  | 'generic'

export type ExternalReferenceKind =
  | 'issue'
  | 'pull-request'
  | 'design'
  | 'video'
  | 'sandbox'
  | 'social'
  | 'audio'
  | 'link'

export interface EmbedProvider {
  name: ExternalReferenceProvider
  displayName: string
  icon: string
  patterns: RegExp[]
  extractId: (url: string) => string | null
  getEmbedUrl: (id: string) => string
  aspectRatio?: number
}

export type ExternalReferenceDescriptor = {
  normalizedUrl: string
  provider: ExternalReferenceProvider
  kind: ExternalReferenceKind
  refId?: string
  title: string
  subtitle?: string
  icon?: string
  embedUrl?: string
  metadata: Record<string, string>
}

export const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    name: 'youtube',
    displayName: 'YouTube',
    icon: '\u25B6\uFE0F',
    patterns: [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/
    ],
    extractId: (url: string) => {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/
      ]
      for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) {
          return match[1]
        }
      }
      return null
    },
    getEmbedUrl: (id: string) => `https://www.youtube.com/embed/${id}`,
    aspectRatio: 16 / 9
  },
  {
    name: 'vimeo',
    displayName: 'Vimeo',
    icon: '\uD83C\uDFAC',
    patterns: [/vimeo\.com\/(\d+)/, /player\.vimeo\.com\/video\/(\d+)/],
    extractId: (url: string) => {
      const match = url.match(/vimeo\.com\/(\d+)/) || url.match(/player\.vimeo\.com\/video\/(\d+)/)
      return match ? match[1] : null
    },
    getEmbedUrl: (id: string) => `https://player.vimeo.com/video/${id}`,
    aspectRatio: 16 / 9
  },
  {
    name: 'spotify',
    displayName: 'Spotify',
    icon: '\uD83C\uDFB5',
    patterns: [/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/],
    extractId: (url: string) => {
      const match = url.match(
        /open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/
      )
      return match ? `${match[1]}/${match[2]}` : null
    },
    getEmbedUrl: (id: string) => `https://open.spotify.com/embed/${id}`
  },
  {
    name: 'twitter',
    displayName: 'Twitter',
    icon: '\uD83D\uDC26',
    patterns: [/(?:twitter\.com|x\.com)\/(?:\w+)\/status\/(\d+)/],
    extractId: (url: string) => {
      const match = url.match(/(?:twitter\.com|x\.com)\/(?:\w+)\/status\/(\d+)/)
      return match ? match[1] : null
    },
    getEmbedUrl: (id: string) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`
  },
  {
    name: 'figma',
    displayName: 'Figma',
    icon: '\uD83C\uDFA8',
    patterns: [/figma\.com\/(file|proto)\/([a-zA-Z0-9]+)/],
    extractId: (url: string) => {
      const match = url.match(/figma\.com\/(file|proto)\/([a-zA-Z0-9]+)/)
      return match ? `${match[1]}/${match[2]}` : null
    },
    getEmbedUrl: (id: string) => {
      const [entity, fileId] = id.split('/')
      return `https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/${entity}/${fileId}`
    },
    aspectRatio: 16 / 9
  },
  {
    name: 'codesandbox',
    displayName: 'CodeSandbox',
    icon: '\uD83D\uDCE6',
    patterns: [/codesandbox\.io\/(?:s|embed)\/([a-zA-Z0-9-]+)/],
    extractId: (url: string) => {
      const match = url.match(/codesandbox\.io\/(?:s|embed)\/([a-zA-Z0-9-]+)/)
      return match ? match[1] : null
    },
    getEmbedUrl: (id: string) =>
      `https://codesandbox.io/embed/${id}?fontsize=14&hidenavigation=1&theme=dark`,
    aspectRatio: 16 / 9
  },
  {
    name: 'loom',
    displayName: 'Loom',
    icon: '\uD83C\uDFA5',
    patterns: [/loom\.com\/(?:share|embed)\/([a-f0-9]+)/],
    extractId: (url: string) => {
      const match = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]+)/)
      return match ? match[1] : null
    },
    getEmbedUrl: (id: string) => `https://www.loom.com/embed/${id}`,
    aspectRatio: 16 / 9
  }
]

function createGenericExternalReferenceDescriptor(
  normalizedUrl: string
): ExternalReferenceDescriptor {
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

function inferReferenceKind(provider: EmbedProvider): ExternalReferenceKind {
  switch (provider.name) {
    case 'figma':
      return 'design'
    case 'youtube':
    case 'vimeo':
    case 'loom':
      return 'video'
    case 'codesandbox':
      return 'sandbox'
    case 'spotify':
      return 'audio'
    case 'twitter':
      return 'social'
    default:
      return 'link'
  }
}

function describeEmbedReference(
  normalizedUrl: string,
  parsed: { provider: EmbedProvider; id: string; embedUrl: string }
): ExternalReferenceDescriptor {
  switch (parsed.provider.name) {
    case 'figma': {
      const [entity, fileId] = parsed.id.split('/')
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Figma ${entity}`,
        subtitle: fileId,
        icon: 'FG',
        embedUrl: parsed.embedUrl,
        metadata: {
          entity,
          fileId
        }
      }
    }
    case 'youtube':
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `YouTube ${parsed.id}`,
        subtitle: parsed.provider.displayName,
        icon: 'YT',
        embedUrl: parsed.embedUrl,
        metadata: {
          videoId: parsed.id
        }
      }
    case 'vimeo':
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Vimeo ${parsed.id}`,
        subtitle: parsed.provider.displayName,
        icon: 'VI',
        embedUrl: parsed.embedUrl,
        metadata: {
          videoId: parsed.id
        }
      }
    case 'loom':
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Loom ${parsed.id.slice(0, 8)}`,
        subtitle: parsed.provider.displayName,
        icon: 'LO',
        embedUrl: parsed.embedUrl,
        metadata: {
          loomId: parsed.id
        }
      }
    case 'codesandbox':
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Sandbox ${parsed.id}`,
        subtitle: parsed.provider.displayName,
        icon: 'CS',
        embedUrl: parsed.embedUrl,
        metadata: {
          sandboxId: parsed.id
        }
      }
    case 'spotify': {
      const [entity = '', mediaId = ''] = parsed.id.split('/')
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Spotify ${entity}`,
        subtitle: mediaId || undefined,
        icon: 'SP',
        embedUrl: parsed.embedUrl,
        metadata: {
          entity,
          mediaId
        }
      }
    }
    case 'twitter':
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: `Post ${parsed.id}`,
        subtitle: 'X',
        icon: 'X',
        embedUrl: parsed.embedUrl,
        metadata: {
          postId: parsed.id
        }
      }
    default:
      return {
        normalizedUrl,
        provider: parsed.provider.name,
        kind: inferReferenceKind(parsed.provider),
        refId: parsed.id,
        title: parsed.provider.displayName,
        subtitle: parsed.id,
        icon: parsed.provider.icon,
        embedUrl: parsed.embedUrl,
        metadata: {
          embedProvider: parsed.provider.name,
          embedId: parsed.id
        }
      }
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

export function detectEmbedProvider(url: string): EmbedProvider | null {
  for (const provider of EMBED_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (pattern.test(url)) {
        return provider
      }
    }
  }

  return null
}

export function parseEmbedUrl(url: string): {
  provider: EmbedProvider
  id: string
  embedUrl: string
} | null {
  const provider = detectEmbedProvider(url)
  if (!provider) {
    return null
  }

  const id = provider.extractId(url)
  if (!id) {
    return null
  }

  return {
    provider,
    id,
    embedUrl: provider.getEmbedUrl(id)
  }
}

export function parseExternalReferenceUrl(input: string): ExternalReferenceDescriptor | null {
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

  const parsedEmbed = parseEmbedUrl(normalizedUrl)
  if (parsedEmbed) {
    return describeEmbedReference(normalizedUrl, parsedEmbed)
  }

  return createGenericExternalReferenceDescriptor(normalizedUrl)
}
