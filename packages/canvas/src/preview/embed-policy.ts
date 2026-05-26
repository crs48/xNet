/**
 * Explicit iframe/embed allow policies for canvas external references.
 */

export type CanvasEmbedProvider =
  | 'youtube'
  | 'spotify'
  | 'vimeo'
  | 'loom'
  | 'figma'
  | 'codesandbox'
  | 'generic'

export type CanvasIframeSecurityAttributes = {
  sandbox: string
  allow: string
  referrerPolicy: 'no-referrer' | 'strict-origin-when-cross-origin'
  loading: 'lazy'
}

export type CanvasEmbedProviderPolicy = {
  provider: CanvasEmbedProvider
  allowedHostnames: readonly string[]
  iframeAttributes: CanvasIframeSecurityAttributes
  metadataFetchingDefault: boolean
}

export type CanvasEmbedPolicyDecision = {
  allowed: boolean
  provider: CanvasEmbedProvider
  reason?: string
  policy: CanvasEmbedProviderPolicy
  iframeAttributes: CanvasIframeSecurityAttributes
}

export type EvaluateCanvasEmbedPolicyInput = {
  provider?: string | null
  embedUrl?: string | null
  allowArbitraryEmbeds?: boolean
}

const STRICT_IFRAME_ATTRIBUTES: CanvasIframeSecurityAttributes = {
  sandbox: 'allow-scripts',
  allow: '',
  referrerPolicy: 'no-referrer',
  loading: 'lazy'
}

const MEDIA_IFRAME_ATTRIBUTES: CanvasIframeSecurityAttributes = {
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
  referrerPolicy: 'strict-origin-when-cross-origin',
  loading: 'lazy'
}

const DESIGN_IFRAME_ATTRIBUTES: CanvasIframeSecurityAttributes = {
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allow: 'fullscreen',
  referrerPolicy: 'strict-origin-when-cross-origin',
  loading: 'lazy'
}

const CANVAS_EMBED_PROVIDER_POLICIES: Readonly<
  Record<CanvasEmbedProvider, CanvasEmbedProviderPolicy>
> = {
  youtube: {
    provider: 'youtube',
    allowedHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
    iframeAttributes: MEDIA_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: true
  },
  spotify: {
    provider: 'spotify',
    allowedHostnames: ['open.spotify.com'],
    iframeAttributes: MEDIA_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: true
  },
  vimeo: {
    provider: 'vimeo',
    allowedHostnames: ['player.vimeo.com', 'vimeo.com'],
    iframeAttributes: MEDIA_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: true
  },
  loom: {
    provider: 'loom',
    allowedHostnames: ['www.loom.com', 'loom.com'],
    iframeAttributes: MEDIA_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: true
  },
  figma: {
    provider: 'figma',
    allowedHostnames: ['www.figma.com', 'figma.com'],
    iframeAttributes: DESIGN_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: true
  },
  codesandbox: {
    provider: 'codesandbox',
    allowedHostnames: ['codesandbox.io', 'www.codesandbox.io'],
    iframeAttributes: {
      ...DESIGN_IFRAME_ATTRIBUTES,
      allow: 'clipboard-read; clipboard-write; fullscreen'
    },
    metadataFetchingDefault: true
  },
  generic: {
    provider: 'generic',
    allowedHostnames: [],
    iframeAttributes: STRICT_IFRAME_ATTRIBUTES,
    metadataFetchingDefault: false
  }
}

function normalizeProvider(provider: string | null | undefined): CanvasEmbedProvider {
  return provider && provider in CANVAS_EMBED_PROVIDER_POLICIES
    ? (provider as CanvasEmbedProvider)
    : 'generic'
}

function getHostname(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function getCanvasEmbedProviderPolicies(): CanvasEmbedProviderPolicy[] {
  return Object.values(CANVAS_EMBED_PROVIDER_POLICIES).map((policy) => ({
    ...policy,
    allowedHostnames: [...policy.allowedHostnames],
    iframeAttributes: { ...policy.iframeAttributes }
  }))
}

export function getCanvasEmbedProviderPolicy(
  provider: string | null | undefined
): CanvasEmbedProviderPolicy {
  const normalized = normalizeProvider(provider)
  const policy = CANVAS_EMBED_PROVIDER_POLICIES[normalized]

  return {
    ...policy,
    allowedHostnames: [...policy.allowedHostnames],
    iframeAttributes: { ...policy.iframeAttributes }
  }
}

export function evaluateCanvasEmbedPolicy(
  input: EvaluateCanvasEmbedPolicyInput
): CanvasEmbedPolicyDecision {
  const provider = normalizeProvider(input.provider)
  const policy = getCanvasEmbedProviderPolicy(provider)
  const hostname = getHostname(input.embedUrl)

  if (!hostname) {
    return {
      allowed: false,
      provider,
      reason: 'Embed URL is missing or invalid.',
      policy,
      iframeAttributes: policy.iframeAttributes
    }
  }

  if (provider === 'generic') {
    return {
      allowed: input.allowArbitraryEmbeds === true,
      provider,
      reason:
        input.allowArbitraryEmbeds === true
          ? undefined
          : 'Arbitrary embeds require explicit workspace approval.',
      policy,
      iframeAttributes: policy.iframeAttributes
    }
  }

  const allowed = policy.allowedHostnames.includes(hostname)

  return {
    allowed,
    provider,
    reason: allowed ? undefined : `Embed host '${hostname}' is not allowed for ${provider}.`,
    policy,
    iframeAttributes: policy.iframeAttributes
  }
}
