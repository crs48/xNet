/**
 * Embed provider registry.
 *
 * Detects URLs from supported services and extracts embed parameters.
 */

export interface EmbedProvider {
  /** Provider identifier */
  name: string
  /** Display name */
  displayName: string
  /** Icon (emoji) */
  icon: string
  /** URL patterns to match */
  patterns: RegExp[]
  /** Extract embed ID from URL */
  extractId: (url: string) => string | null
  /** Generate iframe src from ID */
  getEmbedUrl: (id: string) => string
  /** Default aspect ratio (width/height) */
  aspectRatio?: number
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
      for (const p of patterns) {
        const m = url.match(p)
        if (m) return m[1]
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
      const m = url.match(/vimeo\.com\/(\d+)/) || url.match(/player\.vimeo\.com\/video\/(\d+)/)
      return m ? m[1] : null
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
      const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/)
      return m ? `${m[1]}/${m[2]}` : null
    },
    getEmbedUrl: (id: string) => `https://open.spotify.com/embed/${id}`,
    aspectRatio: undefined // Spotify has variable height
  },
  {
    name: 'twitter',
    displayName: 'Twitter',
    icon: '\uD83D\uDC26',
    patterns: [/(?:twitter\.com|x\.com)\/(?:\w+)\/status\/(\d+)/],
    extractId: (url: string) => {
      const m = url.match(/(?:twitter\.com|x\.com)\/(?:\w+)\/status\/(\d+)/)
      return m ? m[1] : null
    },
    getEmbedUrl: (id: string) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
    aspectRatio: undefined
  },
  {
    name: 'figma',
    displayName: 'Figma',
    icon: '\uD83C\uDFA8',
    patterns: [/figma\.com\/(file|proto)\/([a-zA-Z0-9]+)/],
    extractId: (url: string) => {
      const m = url.match(/figma\.com\/(file|proto)\/([a-zA-Z0-9]+)/)
      return m ? `${m[1]}/${m[2]}` : null
    },
    getEmbedUrl: (id: string) => {
      const [type, fileId] = id.split('/')
      return `https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/${type}/${fileId}`
    },
    aspectRatio: 16 / 9
  },
  {
    name: 'codesandbox',
    displayName: 'CodeSandbox',
    icon: '\uD83D\uDCE6',
    patterns: [/codesandbox\.io\/(?:s|embed)\/([a-zA-Z0-9-]+)/],
    extractId: (url: string) => {
      const m = url.match(/codesandbox\.io\/(?:s|embed)\/([a-zA-Z0-9-]+)/)
      return m ? m[1] : null
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
      const m = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]+)/)
      return m ? m[1] : null
    },
    getEmbedUrl: (id: string) => `https://www.loom.com/embed/${id}`,
    aspectRatio: 16 / 9
  }
]

/**
 * Detect which provider matches a URL.
 */
export function detectProvider(url: string): EmbedProvider | null {
  for (const provider of EMBED_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (pattern.test(url)) {
        return provider
      }
    }
  }
  return null
}

/**
 * Parse a URL and extract embed info.
 */
export function parseEmbedUrl(url: string): {
  provider: EmbedProvider
  id: string
  embedUrl: string
} | null {
  const provider = detectProvider(url)
  if (!provider) return null

  const id = provider.extractId(url)
  if (!id) return null

  return {
    provider,
    id,
    embedUrl: provider.getEmbedUrl(id)
  }
}
