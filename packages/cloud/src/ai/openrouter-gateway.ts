/**
 * @xnetjs/cloud/ai — OpenRouter gateway client.
 *
 * OpenRouter is OpenAI-compatible (`/chat/completions`), so this is shaped like
 * {@link GatewayClient} — but it asks for usage accounting (`usage: { include: true }`)
 * and reads back **`usage.cost`**: the exact USD OpenRouter billed us, with prompt
 * caching / reasoning / image tokens already accounted for. The metered layer
 * charges off that ground truth instead of estimating from a static price table
 * (exploration 0201). Thin + `fetch`-injectable, so it's testable with no key.
 */

import type { ChatGateway, ChatRequest, ChatResult } from './gateway'
import { GatewayError } from './gateway'

export interface OpenRouterGatewayConfig {
  /** OpenRouter API base, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl: string
  fetchImpl?: typeof fetch
  /** `HTTP-Referer` for OpenRouter's app attribution (optional). */
  referer?: string
  /** `X-Title` for OpenRouter's app attribution (optional). */
  title?: string
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    /** USD charged to our OpenRouter credit balance for this generation. */
    cost?: number
  }
}

export class OpenRouterGatewayClient implements ChatGateway {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly referer?: string
  private readonly title?: string

  constructor(config: OpenRouterGatewayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
    this.referer = config.referer
    this.title = config.title
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${req.virtualKey}`,
        ...(this.referer ? { 'http-referer': this.referer } : {}),
        ...(this.title ? { 'x-title': this.title } : {})
      },
      body: JSON.stringify({
        model: req.model,
        // Model-layer fallback: OpenRouter tries these in order on the primary's
        // failure (context overflow, moderation, rate-limit, downtime).
        ...(req.fallbackModels?.length ? { models: [req.model, ...req.fallbackModels] } : {}),
        messages: req.messages,
        // `usage.cost` (and cached/reasoning token detail) is now always returned;
        // the legacy `usage: { include: true }` flag is deprecated and a no-op.
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.mockResponse !== undefined ? { mock_response: req.mockResponse } : {})
      })
    })
    if (!res.ok) {
      // OpenRouter returns 402/429 when a key's spend limit is exhausted.
      throw new GatewayError(`openrouter error ${res.status}: ${await safeText(res)}`, res.status)
    }
    const data = (await res.json()) as OpenRouterChatResponse
    const inputTokens = data.usage?.prompt_tokens ?? 0
    const outputTokens = data.usage?.completion_tokens ?? 0
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? req.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens
      },
      ...(typeof data.usage?.cost === 'number' ? { providerCostUsd: data.usage.cost } : {})
    }
  }
}

const safeText = async (res: Response): Promise<string> => {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
