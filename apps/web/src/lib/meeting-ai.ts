/**
 * AI provider resolution for post-meeting note enhancement (exploration 0279,
 * phase 2). Reuses the AI chat surface's connector detection + settings
 * (0252/0208): the same stored keys (`xnet:ai-*`) and tier preference the
 * user configured for chat drive the meeting enhancement call. Unlike the
 * chat panel, this is non-interactive — tiers that need an explicit in-tab
 * gesture (WebLLM's model download) resolve to null and the recorder simply
 * skips enhancement.
 */

import {
  createAIProvider,
  createManagedProvider,
  createPromptApiProvider,
  detectConnectors,
  type AIProvider,
  type ConnectorTier
} from '@xnetjs/plugins'
import {
  AI_CHAT_STORAGE_KEYS,
  pickUsableConnector,
  providerConfigForConnector,
  type AiChatSettings,
  type CloudProvider
} from '../workbench/views/ai-chat-connector'

const readSetting = (key: string): string =>
  (typeof window !== 'undefined' && window.localStorage.getItem(key)) || ''

function storedSettings(): AiChatSettings {
  const apiKey = readSetting(AI_CHAT_STORAGE_KEYS.apiKey)
  const cloudProvider = readSetting(AI_CHAT_STORAGE_KEYS.cloudProvider) as CloudProvider
  const model = readSetting(AI_CHAT_STORAGE_KEYS.model)
  const localBaseUrl = readSetting(AI_CHAT_STORAGE_KEYS.localBaseUrl)
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(cloudProvider ? { cloudProvider } : {}),
    ...(model ? { model } : {}),
    ...(localBaseUrl ? { localBaseUrl } : {})
  }
}

/**
 * Resolve the provider for one enhancement call, or null when nothing is
 * configured/available (the recorder falls back to `skipEnhancement`).
 */
export async function resolveMeetingAiProvider(): Promise<AIProvider | null> {
  try {
    const settings = storedSettings()
    const detections = await detectConnectors({
      hasCloudKey: () => Boolean(settings.apiKey)
    })
    // Prefer the tier the user last picked in the chat panel, when usable.
    const preferredTier = readSetting(AI_CHAT_STORAGE_KEYS.tier) as ConnectorTier
    const preferred = preferredTier
      ? (detections.find((d) => d.tier === preferredTier && d.available) ?? null)
      : null
    const detection = preferred ?? pickUsableConnector(detections)
    if (!detection) return null

    // Non-interactive surface: WebLLM needs an explicit load gesture — skip.
    if (detection.tier === 'webllm') return null
    if (detection.tier === 'prompt-api') return createPromptApiProvider()
    if (detection.tier === 'managed') {
      return createManagedProvider({
        baseUrl: settings.hubBaseUrl ?? '',
        ...(settings.model ? { model: settings.model } : {})
      })
    }
    const config = providerConfigForConnector(detection, settings)
    return config ? createAIProvider(config) : null
  } catch {
    return null
  }
}
