/**
 * Shared embed provider registry and iframe policy facade.
 */

import type { ExternalReferenceProvider } from './external-references'
import {
  evaluateExternalReferenceEmbedPolicy,
  type ExternalReferenceEmbedPolicy,
  type ExternalReferenceIframeSandboxToken
} from './external-reference-embed-policy'

export type EmbedRegistryProvider =
  | 'youtube'
  | 'spotify'
  | 'vimeo'
  | 'loom'
  | 'figma'
  | 'codesandbox'
  | 'generic'

export type EmbedRegistryIframeSecurityAttributes = {
  sandbox: string
  allow: string
  referrerPolicy: 'no-referrer' | 'strict-origin-when-cross-origin'
  loading: 'lazy'
}

export type EmbedRegistryProviderPolicy = {
  provider: EmbedRegistryProvider
  allowedHostnames: readonly string[]
  iframeAttributes: EmbedRegistryIframeSecurityAttributes
  metadataFetchingDefault: boolean
}

export type EmbedRegistryPolicyDecision = {
  allowed: boolean
  provider: EmbedRegistryProvider
  reason?: string
  policy: EmbedRegistryProviderPolicy
  iframeAttributes: EmbedRegistryIframeSecurityAttributes
}

export type EvaluateEmbedRegistryPolicyInput = {
  provider?: string | null
  embedUrl?: string | null
  allowArbitraryEmbeds?: boolean
}

const STRICT_IFRAME_ATTRIBUTES: EmbedRegistryIframeSecurityAttributes = {
  sandbox: 'allow-scripts',
  allow: '',
  referrerPolicy: 'no-referrer',
  loading: 'lazy'
}

const MEDIA_IFRAME_ATTRIBUTES: EmbedRegistryIframeSecurityAttributes = {
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
  referrerPolicy: 'strict-origin-when-cross-origin',
  loading: 'lazy'
}

const DESIGN_IFRAME_ATTRIBUTES: EmbedRegistryIframeSecurityAttributes = {
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allow: 'fullscreen',
  referrerPolicy: 'strict-origin-when-cross-origin',
  loading: 'lazy'
}

const EMBED_REGISTRY_PROVIDER_POLICIES: Readonly<
  Record<EmbedRegistryProvider, EmbedRegistryProviderPolicy>
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

function normalizeProvider(provider: string | null | undefined): EmbedRegistryProvider {
  return provider && provider in EMBED_REGISTRY_PROVIDER_POLICIES
    ? (provider as EmbedRegistryProvider)
    : 'generic'
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase()
}

function getHostname(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    return normalizeHostname(new URL(url).hostname)
  } catch {
    return null
  }
}

function toAllowedOrigins(policy: EmbedRegistryProviderPolicy): readonly string[] {
  return policy.allowedHostnames.map((hostname) => `https://${hostname}`)
}

function toSandboxTokens(sandbox: string): readonly ExternalReferenceIframeSandboxToken[] {
  return sandbox.split(/\s+/).filter(Boolean) as ExternalReferenceIframeSandboxToken[]
}

function toExternalReferencePolicy(input: {
  provider: EmbedRegistryProvider
  policy: EmbedRegistryProviderPolicy
  allowArbitraryEmbeds: boolean
}): ExternalReferenceEmbedPolicy {
  return {
    allowedProviders:
      input.provider === 'generic' && input.allowArbitraryEmbeds
        ? ['generic']
        : ([input.provider] as ExternalReferenceProvider[]),
    allowedOrigins: toAllowedOrigins(input.policy),
    allowArbitraryIframes: input.provider === 'generic' && input.allowArbitraryEmbeds,
    sandbox: toSandboxTokens(input.policy.iframeAttributes.sandbox),
    allow: input.policy.iframeAttributes.allow,
    referrerPolicy: input.policy.iframeAttributes.referrerPolicy
  }
}

function cloneProviderPolicy(policy: EmbedRegistryProviderPolicy): EmbedRegistryProviderPolicy {
  return {
    ...policy,
    allowedHostnames: [...policy.allowedHostnames],
    iframeAttributes: { ...policy.iframeAttributes }
  }
}

function getBlockedReason(input: {
  provider: EmbedRegistryProvider
  hostname: string
  allowArbitraryEmbeds: boolean
}): string {
  if (input.provider === 'generic' && !input.allowArbitraryEmbeds) {
    return 'Arbitrary embeds require explicit workspace approval.'
  }

  return `Embed host '${input.hostname}' is not allowed for ${input.provider}.`
}

export function getEmbedRegistryProviderPolicies(): EmbedRegistryProviderPolicy[] {
  return Object.values(EMBED_REGISTRY_PROVIDER_POLICIES).map(cloneProviderPolicy)
}

export function getEmbedRegistryProviderPolicy(
  provider: string | null | undefined
): EmbedRegistryProviderPolicy {
  return cloneProviderPolicy(EMBED_REGISTRY_PROVIDER_POLICIES[normalizeProvider(provider)])
}

export function evaluateEmbedRegistryPolicy(
  input: EvaluateEmbedRegistryPolicyInput
): EmbedRegistryPolicyDecision {
  const provider = normalizeProvider(input.provider)
  const policy = getEmbedRegistryProviderPolicy(provider)
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

  const allowArbitraryEmbeds = input.allowArbitraryEmbeds === true
  const decision = evaluateExternalReferenceEmbedPolicy({
    sourceUrl: input.embedUrl ?? '',
    embedUrl: input.embedUrl,
    provider,
    policy: toExternalReferencePolicy({ provider, policy, allowArbitraryEmbeds })
  })

  return {
    allowed: decision.allowed,
    provider,
    reason: decision.allowed
      ? undefined
      : getBlockedReason({ provider, hostname, allowArbitraryEmbeds }),
    policy,
    iframeAttributes: policy.iframeAttributes
  }
}
