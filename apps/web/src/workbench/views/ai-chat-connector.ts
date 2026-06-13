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
  if (match) return match[1]
  return /^https?:\/\//.test(detail) ? detail : undefined
}

// ─── Chat runtime event handling (extracted so it stays pure + tested) ──────────

export interface RuntimeEventLike {
  type: string
  threadId?: string
  payload?: unknown
}

/** The state change a runtime event implies, or null if it's not interesting. */
export interface ChatEventEffect {
  delta?: string
  settled?: boolean
  error?: string
}

export function reduceRuntimeEvent(event: RuntimeEventLike): ChatEventEffect | null {
  if (event.type === 'model.delta') {
    const text = (event.payload as { text?: string } | undefined)?.text
    return text ? { delta: text } : null
  }
  if (event.type === 'run.completed' || event.type === 'model.completed') {
    return { settled: true }
  }
  if (event.type === 'run.failed') {
    const message = (event.payload as { error?: string } | undefined)?.error
    return { settled: true, error: message ?? 'run failed' }
  }
  return null
}

export interface ChatEventHandlers {
  onDelta: (text: string) => void
  onSettled: () => void
  onError: (message: string) => void
}

/** Apply a runtime event to the chat handlers, filtered to the active thread. */
export function applyRuntimeEvent(
  event: RuntimeEventLike,
  activeThreadId: string | null,
  handlers: ChatEventHandlers
): void {
  if (event.threadId && event.threadId !== activeThreadId) return
  const effect = reduceRuntimeEvent(event)
  if (!effect) return
  if (effect.delta) handlers.onDelta(effect.delta)
  if (effect.settled) handlers.onSettled()
  if (effect.error) handlers.onError(effect.error)
}

/** Whether a message can be sent right now. */
export function canSendMessage(content: string, streaming: boolean, hasRuntime: boolean): boolean {
  return content.length > 0 && !streaming && hasRuntime
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
