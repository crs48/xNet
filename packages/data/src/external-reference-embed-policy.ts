/**
 * Workspace policy helpers for external-reference iframe embeds.
 */

import type { ExternalReferenceProvider } from './external-references'
import { parseExternalReferenceUrl } from './external-references'

export type ExternalReferenceIframeSandboxToken =
  | 'allow-downloads'
  | 'allow-forms'
  | 'allow-modals'
  | 'allow-orientation-lock'
  | 'allow-pointer-lock'
  | 'allow-popups'
  | 'allow-popups-to-escape-sandbox'
  | 'allow-presentation'
  | 'allow-same-origin'
  | 'allow-scripts'
  | 'allow-storage-access-by-user-activation'
  | 'allow-top-navigation-by-user-activation'

export type ExternalReferenceEmbedBlockReason =
  | 'missing-embed-url'
  | 'invalid-embed-url'
  | 'provider-blocked'
  | 'origin-blocked'
  | 'arbitrary-iframe-blocked'

export type ExternalReferenceEmbedPolicy = {
  allowedProviders?: readonly ExternalReferenceProvider[]
  allowedOrigins?: readonly string[]
  allowArbitraryIframes?: boolean
  sandbox?: readonly ExternalReferenceIframeSandboxToken[]
  allow?: string
  referrerPolicy?: ReferrerPolicy
}

export type ExternalReferenceEmbedPolicyDecision =
  | {
      allowed: true
      provider: ExternalReferenceProvider
      embedUrl: string
      origin: string
      sandbox: string
      allow: string
      referrerPolicy: ReferrerPolicy
    }
  | {
      allowed: false
      provider: ExternalReferenceProvider
      embedUrl: string | null
      origin: string | null
      reason: ExternalReferenceEmbedBlockReason
    }

export type EvaluateExternalReferenceEmbedPolicyInput = {
  sourceUrl: string
  embedUrl?: string | null
  provider?: string | null
  policy?: ExternalReferenceEmbedPolicy | null
}

const KNOWN_EMBED_PROVIDER_ORIGINS: Partial<Record<ExternalReferenceProvider, readonly string[]>> =
  {
    youtube: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
    vimeo: ['https://player.vimeo.com'],
    spotify: ['https://open.spotify.com'],
    twitter: ['https://platform.twitter.com', 'https://publish.x.com'],
    instagram: ['https://www.instagram.com'],
    tiktok: ['https://www.tiktok.com'],
    figma: ['https://www.figma.com'],
    codesandbox: ['https://codesandbox.io'],
    loom: ['https://www.loom.com']
  }

const DEFAULT_ALLOWED_PROVIDERS = Object.keys(
  KNOWN_EMBED_PROVIDER_ORIGINS
) as ExternalReferenceProvider[]

const DEFAULT_SANDBOX: readonly ExternalReferenceIframeSandboxToken[] = [
  'allow-scripts',
  'allow-same-origin',
  'allow-popups',
  'allow-forms',
  'allow-presentation'
]

export const DEFAULT_EXTERNAL_REFERENCE_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'

function normalizeProvider(value: string | null | undefined): ExternalReferenceProvider | null {
  if (!value) {
    return null
  }

  const providers: readonly ExternalReferenceProvider[] = [
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

  return providers.includes(value as ExternalReferenceProvider)
    ? (value as ExternalReferenceProvider)
    : null
}

function resolveProvider(
  input: EvaluateExternalReferenceEmbedPolicyInput
): ExternalReferenceProvider {
  const parsed = parseExternalReferenceUrl(input.sourceUrl)
  const provider = normalizeProvider(input.provider)
  return provider && provider !== 'generic' ? provider : (parsed?.provider ?? provider ?? 'generic')
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '').toLowerCase()
}

function getOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      return null
    }

    return normalizeOrigin(url.origin)
  } catch {
    return null
  }
}

function getAllowedOrigins(input: {
  provider: ExternalReferenceProvider
  policy?: ExternalReferenceEmbedPolicy | null
}): readonly string[] {
  const providerOrigins = KNOWN_EMBED_PROVIDER_ORIGINS[input.provider] ?? []
  const policyOrigins = input.policy?.allowedOrigins ?? []
  return [...providerOrigins, ...policyOrigins].map(normalizeOrigin)
}

function getSandbox(policy?: ExternalReferenceEmbedPolicy | null): string {
  return [...(policy?.sandbox ?? DEFAULT_SANDBOX)].join(' ')
}

function getAllowedProviders(
  policy?: ExternalReferenceEmbedPolicy | null
): readonly ExternalReferenceProvider[] {
  return policy?.allowedProviders ?? DEFAULT_ALLOWED_PROVIDERS
}

export function evaluateExternalReferenceEmbedPolicy(
  input: EvaluateExternalReferenceEmbedPolicyInput
): ExternalReferenceEmbedPolicyDecision {
  const provider = resolveProvider(input)
  const embedUrl = input.embedUrl?.trim() || null
  if (!embedUrl) {
    return {
      allowed: false,
      provider,
      embedUrl: null,
      origin: null,
      reason: 'missing-embed-url'
    }
  }

  const origin = getOrigin(embedUrl)
  if (!origin) {
    return {
      allowed: false,
      provider,
      embedUrl,
      origin: null,
      reason: 'invalid-embed-url'
    }
  }

  const allowedProviders = getAllowedProviders(input.policy)
  const providerOrigins = KNOWN_EMBED_PROVIDER_ORIGINS[provider] ?? []
  const isKnownProvider = providerOrigins.length > 0
  const allowArbitraryIframes = input.policy?.allowArbitraryIframes === true

  if (!allowedProviders.includes(provider) && !(allowArbitraryIframes && !isKnownProvider)) {
    return {
      allowed: false,
      provider,
      embedUrl,
      origin,
      reason: 'provider-blocked'
    }
  }

  const allowedOrigins = getAllowedOrigins({ provider, policy: input.policy })
  if (allowedOrigins.includes(origin) || (allowArbitraryIframes && !isKnownProvider)) {
    return {
      allowed: true,
      provider,
      embedUrl,
      origin,
      sandbox: getSandbox(input.policy),
      allow: input.policy?.allow ?? DEFAULT_EXTERNAL_REFERENCE_IFRAME_ALLOW,
      referrerPolicy: input.policy?.referrerPolicy ?? 'strict-origin-when-cross-origin'
    }
  }

  return {
    allowed: false,
    provider,
    embedUrl,
    origin,
    reason: isKnownProvider ? 'origin-blocked' : 'arbitrary-iframe-blocked'
  }
}
