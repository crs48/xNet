/**
 * Maps a detected model connector + local settings to an AIProviderConfig
 * (exploration 0174). Pure, so it is unit-tested without a browser.
 *
 * The cloud-key and local-server / bridge tiers resolve to a `createAIProvider`
 * config. The in-tab tiers (webllm, prompt-api) need an injected engine/session
 * and are constructed directly in the panel, so they return null here.
 */

import type { AIProviderConfig, ConnectorDetection, ConnectorTier } from '@xnetjs/plugins'

export type CloudProvider = 'anthropic' | 'openai' | 'openrouter'

export interface AiChatSettings {
  /** BYO cloud API key (stored locally, never sent to the hub). */
  apiKey?: string
  /** Which cloud provider the key is for. */
  cloudProvider?: CloudProvider
  /** Optional model id override. */
  model?: string
  /** Base URL override for the local-server tier. */
  localBaseUrl?: string
}

/** localStorage keys (xnet:* convention). */
export const AI_CHAT_STORAGE_KEYS = {
  apiKey: 'xnet:ai-api-key',
  cloudProvider: 'xnet:ai-cloud-provider',
  model: 'xnet:ai-model',
  localBaseUrl: 'xnet:ai-local-base-url'
} as const

/** Connector tiers that resolve to a `createAIProvider` config (vs. in-tab). */
export const PROVIDER_CONFIG_TIERS: readonly ConnectorTier[] = [
  'cloud-key',
  'local-server',
  'bridge'
]

/**
 * Resolve an AIProviderConfig for a connector, or null when the tier needs an
 * in-tab engine (webllm / prompt-api) or required settings are missing.
 */
export function providerConfigForConnector(
  detection: ConnectorDetection,
  settings: AiChatSettings
): AIProviderConfig | null {
  switch (detection.tier) {
    case 'cloud-key': {
      if (!settings.apiKey) return null
      const type = settings.cloudProvider ?? 'anthropic'
      return {
        type,
        options: { apiKey: settings.apiKey, ...(settings.model ? { model: settings.model } : {}) }
      }
    }
    case 'local-server': {
      const baseUrl = settings.localBaseUrl ?? baseUrlFromDetail(detection.detail)
      const type = /lm studio/i.test(detection.detail ?? '') ? 'lmstudio' : 'ollama'
      return {
        type,
        options: {
          ...(baseUrl ? { baseUrl } : {}),
          ...(settings.model ? { model: settings.model } : {})
        }
      }
    }
    case 'bridge': {
      // The bridge daemon exposes an OpenAI-compatible endpoint on loopback.
      const baseUrl = baseUrlFromDetail(detection.detail)
      if (!baseUrl) return null
      return {
        type: 'openai-compatible',
        options: { baseUrl, ...(settings.model ? { model: settings.model } : {}) }
      }
    }
    default:
      // webllm / prompt-api are constructed directly with an injected engine.
      return null
  }
}

/** Extract the `(http://host:port)` base URL embedded in a detection detail. */
export function baseUrlFromDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined
  const match = detail.match(/\((https?:\/\/[^)]+)\)/)
  return match?.[1] ?? (/^https?:\/\//.test(detail) ? detail : undefined)
}
